import re
import threading
from types import SimpleNamespace

import anthropic
import httpx2
import pytest

from app.services import humanizer
from app.services.humanizer import (
    SYSTEM_PROMPT,
    HumanizeError,
    Tone,
    _chunks,
    _model_options,
    _segments,
    humanize,
)


def usage(i=10, o=20):
    return SimpleNamespace(
        input_tokens=i, output_tokens=o, cache_read_input_tokens=0, cache_creation_input_tokens=0
    )


def reply(text, stop_reason="end_turn"):
    return SimpleNamespace(
        content=[SimpleNamespace(type="text", text=text)], stop_reason=stop_reason, usage=usage()
    )


class FakeClient:
    """Responde em maiúsculas o que veio dentro de <texto>, registrando as chamadas."""

    def __init__(self, handler=None):
        self.calls = []
        self._lock = threading.Lock()
        self.handler = handler or (lambda text, kw: reply(f"<reescrita>{text.upper()}</reescrita>"))
        self.messages = SimpleNamespace(create=self._create)

    def _create(self, **kwargs):
        content = kwargs["messages"][0]["content"]
        text = re.search(r"<texto>\n(.*)\n</texto>", content, re.DOTALL).group(1)
        with self._lock:
            self.calls.append(kwargs)
        return self.handler(text, kwargs)


def api_error(cls, status):
    request = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    return cls("erro", response=httpx2.Response(status, request=request), body=None)


# --- chunking -------------------------------------------------------------------


def test_chunks_group_whole_paragraphs():
    text = "\n\n".join(f"par{i} " + "a " * 9 for i in range(5))  # 10 palavras cada
    chunks = _chunks(_segments(text, 25), 25)
    assert [len(c) for c in chunks] == [2, 2, 1]
    assert all(seg.sep == "\n\n" for c in chunks for seg in c)


def test_long_paragraph_splits_on_sentences_never_mid_sentence():
    sentences = [f"Frase número {i} com algumas palavras." for i in range(10)]  # 6 cada
    segs = _segments(" ".join(sentences), 15)
    assert all(s.text.endswith(".") for s in segs)
    assert [s.sep for s in segs][-1] == "\n\n"
    assert all(s.sep == " " for s in segs[:-1])
    assert " ".join(s.text for s in segs) == " ".join(sentences)


def test_abbreviation_does_not_split():
    segs = _segments("Segundo Silva et al. afirmam que sim. Outra frase aqui.", 4)
    assert segs[0].text == "Segundo Silva et al. afirmam que sim."


# --- humanize -------------------------------------------------------------------


def test_humanize_preserves_paragraph_structure_and_order():
    text = "\n\n".join(f"parágrafo {i}" + " x" * 8 for i in range(6))
    client = FakeClient()
    result = humanize(text, paid=True, client=client, max_chunk_words=25)
    assert result.text == text.upper()
    assert result.chunks == 3
    assert result.usage.requests == 3
    assert result.usage.input_tokens == 30
    assert result.input_words == result.output_words


def test_split_paragraph_is_rejoined_with_space():
    text = "Primeira frase do texto. Segunda frase do texto. Terceira frase do texto."
    result = humanize(text, paid=True, client=FakeClient(), max_chunk_words=4)
    assert result.text == text.upper()


def test_request_shape_paid_model():
    client = FakeClient()
    humanize("Um texto.", paid=True, tone=Tone.CASUAL, client=client)
    kw = client.calls[0]
    assert kw["model"] == "claude-sonnet-5"
    assert kw["thinking"] == {"type": "disabled"}
    assert kw["output_config"] == {"effort": "low"}
    assert kw["system"][0]["text"] == SYSTEM_PROMPT
    assert kw["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert "informal" in kw["messages"][0]["content"]


def test_free_model_sends_no_effort():
    client = FakeClient()
    humanize("Um texto.", paid=False, client=client)
    kw = client.calls[0]
    assert kw["model"] == "claude-haiku-4-5"
    assert "output_config" not in kw and "thinking" not in kw


@pytest.mark.parametrize(
    ("model", "expected"),
    [
        ("claude-sonnet-5", {"thinking": {"type": "disabled"}, "output_config": {"effort": "low"}}),
        (
            "claude-sonnet-5-5",
            {"thinking": {"type": "between_tools"}, "output_config": {"effort": "low"}},
        ),
        ("claude-opus-5-5", {"output_config": {"effort": "low"}}),
        ("claude-haiku-4-5", {}),
    ],
)
def test_model_options(model, expected):
    assert _model_options(model) == expected


def test_system_prompt_is_identical_across_tones():
    client = FakeClient()
    for tone in Tone:
        humanize("Texto.", paid=True, tone=tone, client=client)
    assert len({c["system"][0]["text"] for c in client.calls}) == 1


def test_output_without_tags_is_accepted():
    client = FakeClient(lambda text, kw: reply("  só o texto  "))
    assert humanize("Algo.", paid=True, client=client).text == "só o texto"


def test_max_tokens_splits_chunk_and_retries():
    def handler(text, kw):
        if "\n\n" in text:  # chunk com mais de um parágrafo "estoura"
            return reply("<reescrita>cortado", stop_reason="max_tokens")
        return reply(f"<reescrita>{text.upper()}</reescrita>")

    text = "um dois.\n\ntrês quatro.\n\ncinco seis."
    result = humanize(text, paid=True, client=FakeClient(handler))
    assert result.text == text.upper()


def test_max_tokens_on_single_paragraph_is_an_error():
    client = FakeClient(lambda text, kw: reply("x", stop_reason="max_tokens"))
    with pytest.raises(HumanizeError, match="longo demais") as exc:
        humanize("Um parágrafo só.", paid=True, client=client)
    assert exc.value.retryable is False


def test_refusal_is_not_retryable():
    client = FakeClient(lambda text, kw: reply("", stop_reason="refusal"))
    with pytest.raises(HumanizeError, match="recusou") as exc:
        humanize("Texto.", paid=True, client=client)
    assert exc.value.retryable is False


@pytest.mark.parametrize(
    ("error", "retryable"),
    [
        (api_error(anthropic.RateLimitError, 429), True),
        (api_error(anthropic.InternalServerError, 500), True),
        (api_error(anthropic.BadRequestError, 400), False),
        (anthropic.APIConnectionError(request=httpx2.Request("POST", "https://x")), True),
    ],
)
def test_api_errors_map_to_retryable(error, retryable):
    def handler(text, kw):
        raise error

    with pytest.raises(HumanizeError) as exc:
        humanize("Texto.", paid=True, client=FakeClient(handler))
    assert exc.value.retryable is retryable


def test_empty_text_is_rejected():
    with pytest.raises(HumanizeError):
        humanize("  \n\n ", paid=True, client=FakeClient())


def test_get_client_is_cached(monkeypatch):
    humanizer.get_client.cache_clear()
    monkeypatch.setattr(humanizer.settings, "anthropic_api_key", "sk-teste")
    assert humanizer.get_client() is humanizer.get_client()
    humanizer.get_client.cache_clear()
