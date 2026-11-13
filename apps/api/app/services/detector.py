"""Detector de texto gerado por IA: perplexidade + burstiness.

Dois sinais clássicos de LLM:
- Perplexidade baixa: o modelo "conhece" bem o que vem a seguir (distribuição
  de próxima token concentrada). Texto humano costuma ser mais surpreendente.
- Burstiness baixa: variação da perplexidade entre frases. Humano alterna
  frases simples e complexas; LLM tende a uma cadência uniforme.

A saída é **probabilidade com faixa de confiança** + trechos destacados —
**nunca** um veredito binário.

Pesos do classificador: **precisam ser calibrados contra corpus rotulado PT-BR**.
Qualquer valor abaixo é um chute e está comentado como tal.

Dependências opcionais (extra `detector` no pyproject):
- `torch` + `transformers`: calcula perplexidade real com modelo PT-BR
  (`settings.detector_model`, default `pierreguillou/gpt2-small-portuguese`).
Sem elas, cai para heurísticas baseadas em zipf/entropia de n-gramas —
menos preciso, mas funcional sem GPU e sem download de modelo.
"""

import math
import re
import statistics
from dataclasses import dataclass
from enum import StrEnum
from functools import lru_cache

from app.core.config import settings
from app.services.extract import count_words

# ---------------------------------------------------------------------------
# Configuração (PESOS SÃO CHUTES — CALIBRAR COM CORPUS ROTULADO PT-BR)
# ---------------------------------------------------------------------------

# Limiares heurísticos de perplexidade (tokens) — chute, calibrar.
# GPT-2 small PT-BR: perplexidade típica humano ~150–300, LLM ~40–100.
_LOW_PERPLEXITY_THRESHOLD = 80.0      # abaixo disto: forte sinal de IA
_HIGH_PERPLEXITY_THRESHOLD = 250.0    # acima disto: forte sinal de humano

# Limiares de burstiness (desvio-padrão da perplexidade por frase) — chute.
_LOW_BURSTINESS_THRESHOLD = 15.0      # cadência muito uniforme → IA
_HIGH_BURSTINESS_THRESHOLD = 50.0     # variação alta → humano

# Pesos do score final (soma = 1.0) — **CHUTE, CALIBRAR**.
_W_PERPLEXITY = 0.55
_W_BURSTINESS = 0.30
_W_HEURISTICS = 0.15  # sinais auxiliares (repetição, Zipf, etc.)

# Confiança baseada em nº de frases: <5 frases = baixa confiança.
_MIN_SENTENCES_FOR_CONFIDENCE = 5
_MAX_SENTENCES_FOR_FULL_CONFIDENCE = 30

# Janela de contexto para destacar trechos (frases vizinhas).
_HIGHLIGHT_WINDOW = 1


# ---------------------------------------------------------------------------
# Exceções e enums
# ---------------------------------------------------------------------------


class DetectionError(Exception):
    """Falha na detecção. `retryable` diz se vale tentar de novo mais tarde."""

    def __init__(self, message: str, *, retryable: bool) -> None:
        super().__init__(message)
        self.retryable = retryable


class Signal(StrEnum):
    """Sinais que compõem o score, para explicação no resultado."""
    PERPLEXITY = "perplexidade"
    BURSTINESS = "burstiness"
    HEURISTICS = "heuristicas"


# ---------------------------------------------------------------------------
# Estruturas de resultado
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class SentenceScore:
    """Score de uma frase individual."""
    index: int
    text: str
    perplexity: float | None
    signal: Signal
    contribution: float  # quanto esta frase puxou o score final (0..1)


@dataclass(frozen=True, slots=True)
class HighlightedSpan:
    """Trecho destacado para a UI."""
    start_char: int
    end_char: int
    label: str  # "baixa_perplexidade", "burstiness_baixa", "repeticao", etc.
    severity: float  # 0..1, quão forte o sinal neste trecho
    sentence_indices: tuple[int, ...]


@dataclass
class DetectionResult:
    """Resultado completo da detecção."""
    ai_probability: float          # 0..1
    confidence: float              # 0..1 (baseado em nº de frases)
    confidence_label: str          # "baixa", "média", "alta"
    signals: dict[Signal, float]   # contribuição de cada sinal (0..1)
    sentence_scores: list[SentenceScore]
    highlights: list[HighlightedSpan]
    model_used: str | None         # nome do modelo se neural, None se heurístico
    words_analyzed: int
    sentences_analyzed: int

    def to_dict(self) -> dict:
        """Serializa para Job.result (JSONB)."""
        return {
            "ai_probability": self.ai_probability,
            "confidence": self.confidence,
            "confidence_label": self.confidence_label,
            "signals": {k.value: v for k, v in self.signals.items()},
            "sentence_scores": [
                {
                    "index": s.index,
                    "text": s.text,
                    "perplexity": s.perplexity,
                    "signal": s.signal.value,
                    "contribution": s.contribution,
                }
                for s in self.sentence_scores
            ],
            "highlights": [
                {
                    "start_char": h.start_char,
                    "end_char": h.end_char,
                    "label": h.label,
                    "severity": h.severity,
                    "sentence_indices": list(h.sentence_indices),
                }
                for h in self.highlights
            ],
            "model_used": self.model_used,
            "words_analyzed": self.words_analyzed,
            "sentences_analyzed": self.sentences_analyzed,
        }


# ---------------------------------------------------------------------------
# Utilitários de texto
# ---------------------------------------------------------------------------

# Fim de frase seguido de espaço e início de nova frase (não quebra em abreviação).
_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?…])\s+(?=[\"“(\[A-ZÀ-Ý0-9])")
_WORD_RE = re.compile(r"\w+(?:[-'’]\w+)*")


def split_sentences(text: str) -> list[str]:
    """Divide texto em frases, preservando a pontuação final."""
    sentences = _SENTENCE_SPLIT_RE.split(text.strip())
    return [s.strip() for s in sentences if s.strip()]


def sentence_spans(text: str) -> list[tuple[int, int]]:
    """Retorna (start_char, end_char) de cada frase no texto original."""
    spans: list[tuple[int, int]] = []
    pos = 0
    for sentence in split_sentences(text):
        start = text.find(sentence, pos)
        if start == -1:
            # Fallback: aproxima
            start = pos
        end = start + len(sentence)
        spans.append((start, end))
        pos = end
    return spans


# ---------------------------------------------------------------------------
# Perplexidade: neural (transformers) ou heurística (zipf/entropia)
# ---------------------------------------------------------------------------


class _PerplexityBackend:
    """Backend de perplexidade: neural se disponível, senão heurístico."""

    def __init__(self) -> None:
        self._neural_ready = False
        self._model = None
        self._tokenizer = None
        self._device = "cpu"

    def _load_neural(self) -> bool:
        """Tenta carregar o modelo neural. Retorna True se 성공."""
        if self._neural_ready:
            return self._model is not None
        self._neural_ready = True
        try:
            import torch
            from transformers import AutoModelForCausalLM, AutoTokenizer

            model_name = settings.detector_model
            self._tokenizer = AutoTokenizer.from_pretrained(model_name)
            self._model = AutoModelForCausalLM.from_pretrained(
                model_name,
                torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
                low_cpu_mem_usage=True,
            )
            self._model.eval()
            self._device = "cuda" if torch.cuda.is_available() else "cpu"
            self._model.to(self._device)
            return True
        except Exception:
            # Qualquer falha (import, download, OOM) → heurístico
            self._model = None
            self._tokenizer = None
            return False

    def perplexity(self, text: str) -> float | None:
        """Perplexidade média do texto. None se não conseguir calcular."""
        if self._load_neural() and self._model and self._tokenizer:
            return self._neural_perplexity(text)
        return self._heuristic_perplexity(text)

    def sentence_perplexities(self, sentences: list[str]) -> list[float | None]:
        """Perplexidade de cada frase individual."""
        if self._load_neural() and self._model and self._tokenizer:
            return [self._neural_perplexity(s) for s in sentences]
        return [self._heuristic_perplexity(s) for s in sentences]

    def _neural_perplexity(self, text: str) -> float | None:
        import torch

        try:
            # Tokeniza com truncation para evitar OOM em frases longas
            inputs = self._tokenizer(
                text,
                return_tensors="pt",
                truncation=True,
                max_length=512,
            ).to(self._device)

            with torch.no_grad():
                outputs = self._model(**inputs, labels=inputs["input_ids"])
                loss = outputs.loss

            if loss is None or not torch.isfinite(loss):
                return None
            return float(torch.exp(loss).item())
        except Exception:
            return None

    def _heuristic_perplexity(self, text: str) -> float | None:
        """Heurística baseada em entropia de n-gramas + lei de Zipf.
        Não é perplexidade real, mas correlaciona: texto de LLM tem
        distribuições mais previsíveis (entropia menor).
        """
        words = _WORD_RE.findall(text.lower())
        if len(words) < 5:
            return None

        # Entropia de bigramas
        bigrams = list(zip(words[:-1], words[1:], strict=False))
        if not bigrams:
            return None

        from collections import Counter

        bigram_counts = Counter(bigrams)
        total = len(bigrams)
        entropy = -sum((c / total) * math.log2(c / total) for c in bigram_counts.values())

        # Lei de Zipf: texto humano segue Zipf mais de perto.
        # Calculamos o R² do fit log-log rank vs frequência.
        word_counts = Counter(words)
        ranks = range(1, len(word_counts) + 1)
        freqs = sorted(word_counts.values(), reverse=True)

        if len(freqs) < 10:
            zipf_r2 = 0.0
        else:
            log_ranks = [math.log(r) for r in ranks]
            log_freqs = [math.log(f) for f in freqs]
            n = len(log_ranks)
            sum_x = sum(log_ranks)
            sum_y = sum(log_freqs)
            sum_xy = sum(x * y for x, y in zip(log_ranks, log_freqs, strict=False))
            sum_x2 = sum(x * x for x in log_ranks)
            sum_y2 = sum(y * y for y in log_freqs)

            denom = math.sqrt(max(1e-9, (n * sum_x2 - sum_x**2) * (n * sum_y2 - sum_y**2)))
            if denom == 0:
                zipf_r2 = 0.0
            else:
                r = (n * sum_xy - sum_x * sum_y) / denom
                zipf_r2 = r * r

        # Combina: entropia baixa + Zipf alto = mais "LLM-like"
        # Normaliza para escala ~perplexidade (heurística)
        # Entropia típica bigramas PT: 8–12 bits. Zipf R² humano ~0.92–0.97.
        norm_entropy = max(0.0, 1.0 - (entropy - 6.0) / 8.0)  # 6..14 → 1..0
        norm_zipf = max(0.0, (zipf_r2 - 0.80) / 0.20)         # 0.80..1.0 → 0..1

        # Score composto invertido (mais alto = mais humano)
        human_like = (norm_entropy * 0.6 + norm_zipf * 0.4)
        # Mapeia para pseudo-perplexidade: humano ~250, LLM ~60
        return 60.0 + human_like * 190.0


@lru_cache(maxsize=1)
def get_perplexity_backend() -> _PerplexityBackend:
    return _PerplexityBackend()


# ---------------------------------------------------------------------------
# Sinais auxiliares (heurísticos)
# ---------------------------------------------------------------------------


def _repetition_score(sentences: list[str]) -> float:
    """Penaliza repetição de n-gramas entre frases (LLM repete mais)."""
    if len(sentences) < 3:
        return 0.0

    from collections import Counter

    # Trigramas de palavras em todo o texto
    all_words = []
    for s in sentences:
        all_words.extend(_WORD_RE.findall(s.lower()))

    if len(all_words) < 6:
        return 0.0

    trigrams = list(zip(all_words[:-2], all_words[1:-1], all_words[2:], strict=False))
    trigram_counts = Counter(trigrams)
    repeated = sum(1 for c in trigram_counts.values() if c > 1)
    return min(1.0, repeated / max(1, len(trigrams) * 0.1))


def _transition_diversity(sentences: list[str]) -> float:
    """Diversidade de conectivos/inícios de frase. Humano varia mais."""
    if len(sentences) < 3:
        return 0.5

    starters = []
    for s in sentences:
        words = _WORD_RE.findall(s.lower())
        if words:
            starters.append(words[0])

    unique = len(set(starters))
    total = len(starters)
    return unique / total if total > 0 else 0.5


def _average_sentence_length_variation(sentences: list[str]) -> float:
    """Coeficiente de variação do comprimento das frases. Humano varia mais."""
    lengths = [count_words(s) for s in sentences]
    if len(lengths) < 2:
        return 0.0
    mean = statistics.mean(lengths)
    if mean == 0:
        return 0.0
    return statistics.stdev(lengths) / mean


# ---------------------------------------------------------------------------
# Pipeline principal
# ---------------------------------------------------------------------------


def detect(
    text: str,
    *,
    client: "_PerplexityBackend | None" = None,
) -> DetectionResult:
    """Detecta probabilidade de texto ser gerado por IA.

    Args:
        text: Texto já extraído e sanitizado (parágrafos separados por linha em branco).
        client: Backend de perplexidade (para testes com mock).

    Returns:
        DetectionResult com probabilidade, confiança, sinais e highlights.
    """
    backend = client or get_perplexity_backend()

    sentences = split_sentences(text)
    if not sentences:
        raise DetectionError("Não há texto para analisar.", retryable=False)

    words_analyzed = count_words(text)
    sentences_analyzed = len(sentences)

    # 1) Perplexidade global e por frase
    global_perplexity = backend.perplexity(text)
    sent_perplexities = backend.sentence_perplexities(sentences)

    # 2) Burstiness = desvio-padrão da perplexidade por frase
    valid_perps = [p for p in sent_perplexities if p is not None]
    burstiness = statistics.stdev(valid_perps) if len(valid_perps) >= 2 else 0.0

    # 3) Sinais heurísticos auxiliares
    rep_score = _repetition_score(sentences)
    trans_div = _transition_diversity(sentences)
    len_var = _average_sentence_length_variation(sentences)
    heuristics_score = (
        rep_score * 0.4
        + (1.0 - trans_div) * 0.3
        + (1.0 - min(1.0, len_var * 2)) * 0.3
    )

    # 4) Normaliza cada sinal para 0..1 (1 = mais "IA-like")
    # Perplexidade: baixa → IA
    if global_perplexity is not None:
        if global_perplexity <= _LOW_PERPLEXITY_THRESHOLD:
            perp_signal = 1.0
        elif global_perplexity >= _HIGH_PERPLEXITY_THRESHOLD:
            perp_signal = 0.0
        else:
            # Interpolação linear
            perp_signal = 1.0 - (global_perplexity - _LOW_PERPLEXITY_THRESHOLD) / (
                _HIGH_PERPLEXITY_THRESHOLD - _LOW_PERPLEXITY_THRESHOLD
            )
    else:
        perp_signal = 0.5  # neutro se não conseguiu calcular

    # Burstiness: baixa → IA
    if burstiness <= _LOW_BURSTINESS_THRESHOLD:
        burst_signal = 1.0
    elif burstiness >= _HIGH_BURSTINESS_THRESHOLD:
        burst_signal = 0.0
    else:
        burst_signal = 1.0 - (burstiness - _LOW_BURSTINESS_THRESHOLD) / (
            _HIGH_BURSTINESS_THRESHOLD - _LOW_BURSTINESS_THRESHOLD
        )

    # Heurísticas: já está em 0..1 (1 = mais IA-like)
    heur_signal = heuristics_score

    # 5) Score final ponderado
    ai_probability = (
        _W_PERPLEXITY * perp_signal
        + _W_BURSTINESS * burst_signal
        + _W_HEURISTICS * heur_signal
    )
    ai_probability = max(0.0, min(1.0, ai_probability))

    # 6) Confiança baseada em nº de frases
    if sentences_analyzed < _MIN_SENTENCES_FOR_CONFIDENCE:
        confidence = sentences_analyzed / _MIN_SENTENCES_FOR_CONFIDENCE * 0.6
    elif sentences_analyzed >= _MAX_SENTENCES_FOR_FULL_CONFIDENCE:
        confidence = 1.0
    else:
        confidence = 0.6 + 0.4 * (
            (sentences_analyzed - _MIN_SENTENCES_FOR_CONFIDENCE)
            / (_MAX_SENTENCES_FOR_FULL_CONFIDENCE - _MIN_SENTENCES_FOR_CONFIDENCE)
        )

    confidence_label = (
        "baixa" if confidence < 0.5 else "média" if confidence < 0.8 else "alta"
    )

    # 7) Contribuição de cada sinal para o score final
    signals = {
        Signal.PERPLEXITY: _W_PERPLEXITY * perp_signal,
        Signal.BURSTINESS: _W_BURSTINESS * burst_signal,
        Signal.HEURISTICS: _W_HEURISTICS * heur_signal,
    }

    # 8) Score por frase (para highlights)
    spans = sentence_spans(text)
    sentence_scores: list[SentenceScore] = []
    for i, (sent, (_start, _end)) in enumerate(zip(sentences, spans, strict=False)):
        perp = sent_perplexities[i] if i < len(sent_perplexities) else None

        # Determina qual sinal dominou nesta frase
        sent_signals = []
        if perp is not None:
            if perp <= _LOW_PERPLEXITY_THRESHOLD:
                sent_signals.append((Signal.PERPLEXITY, 1.0))
            elif perp >= _HIGH_PERPLEXITY_THRESHOLD:
                sent_signals.append((Signal.PERPLEXITY, 0.0))
            else:
                sent_signals.append((
                    Signal.PERPLEXITY,
                    1.0 - (perp - _LOW_PERPLEXITY_THRESHOLD)
                    / (_HIGH_PERPLEXITY_THRESHOLD - _LOW_PERPLEXITY_THRESHOLD)
                ))

        # Heurística local: repetição de trigramas nesta frase vs resto
        sent_rep = _repetition_score([sent])
        sent_signals.append((Signal.HEURISTICS, sent_rep))

        # Sinal dominante
        dominant = max(sent_signals, key=lambda x: x[1])
        contribution = dominant[1] * (signals[dominant[0]] / max(1e-9, sum(signals.values())))

        sentence_scores.append(
            SentenceScore(
                index=i,
                text=sent,
                perplexity=perp,
                signal=dominant[0],
                contribution=contribution,
            )
        )

    # 9) Highlights: janela ao redor das frases com maior contribuição
    highlights: list[HighlightedSpan] = []
    sorted_scores = sorted(sentence_scores, key=lambda s: s.contribution, reverse=True)
    top_k = max(1, min(5, len(sorted_scores) // 3))  # top ~33%, máx 5

    for ss in sorted_scores[:top_k]:
        if ss.contribution < 0.05:  # muito fraco
            continue

        window_start = max(0, ss.index - _HIGHLIGHT_WINDOW)
        window_end = min(len(spans) - 1, ss.index + _HIGHLIGHT_WINDOW)
        h_start = spans[window_start][0]
        h_end = spans[window_end][1]

        label_map = {
            Signal.PERPLEXITY: "baixa_perplexidade",
            Signal.BURSTINESS: "burstiness_baixa",
            Signal.HEURISTICS: "padroes_repetitivos",
        }
        highlights.append(
            HighlightedSpan(
                start_char=h_start,
                end_char=h_end,
                label=label_map.get(ss.signal, "sinal_ia"),
                severity=min(1.0, ss.contribution * 2),
                sentence_indices=tuple(range(window_start, window_end + 1)),
            )
        )

    # Ordena highlights por posição no texto
    highlights.sort(key=lambda h: h.start_char)

    model_used = settings.detector_model if backend._model is not None else None

    return DetectionResult(
        ai_probability=ai_probability,
        confidence=confidence,
        confidence_label=confidence_label,
        signals=signals,
        sentence_scores=sentence_scores,
        highlights=highlights,
        model_used=model_used,
        words_analyzed=words_analyzed,
        sentences_analyzed=sentences_analyzed,
    )