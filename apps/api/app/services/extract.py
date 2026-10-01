"""Extração de texto de `.docx`, `.pdf` e `.txt`.

O tipo é decidido pelos bytes (assinatura do arquivo), não pela extensão: um PDF
renomeado para `.docx` é tratado como PDF. A extensão só desempata o caso de texto
puro, que não tem assinatura.

A saída preserva PARÁGRAFOS separados por linha em branco — o humanizador quebra
por parágrafo, então juntar tudo numa linha só ou manter as quebras de linha
visuais do PDF destruiria a coerência dos chunks.

Caracteres invisíveis (zero-width etc.) NÃO são removidos aqui: isso é trabalho do
`sanitize.py`, e o detector pode querer sinalizá-los.

Tudo aqui é síncrono e CPU-bound; quem chama de rota async deve usar
`run_in_threadpool` (ou rodar no worker).
"""

import io
import re
import statistics
import unicodedata
import zipfile
from dataclasses import dataclass
from enum import StrEnum

from app.core.config import settings


class FileKind(StrEnum):
    TXT = "txt"
    DOCX = "docx"
    PDF = "pdf"


MIME_TYPES: dict[FileKind, str] = {
    FileKind.TXT: "text/plain",
    FileKind.DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    FileKind.PDF: "application/pdf",
}

# Defesa contra zip bomb: soma dos tamanhos descomprimidos declarados no .docx.
# Um TCC de 200 páginas fica bem abaixo de 20 MB de XML.
MAX_DOCX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024
MAX_PDF_PAGES = 500

_TEXT_EXTENSIONS = {"", ".txt", ".md", ".text"}

# Palavra = sequência de letras/dígitos, com hífen ou apóstrofo interno
# ("guarda-chuva", "d'água" contam como uma). É a unidade de crédito do produto,
# então todo serviço deve contar palavras por aqui.
_WORD_RE = re.compile(r"\w+(?:[-'’]\w+)*")


class ExtractionError(Exception):
    """Arquivo inválido, não suportado ou sem texto. A mensagem vai para o usuário."""


@dataclass(frozen=True, slots=True)
class ExtractedText:
    kind: FileKind
    text: str
    word_count: int
    page_count: int | None = None  # só PDF

    @property
    def mime_type(self) -> str:
        return MIME_TYPES[self.kind]


def count_words(text: str) -> int:
    return len(_WORD_RE.findall(text))


def detect_kind(data: bytes, filename: str = "") -> FileKind:
    """Identifica o tipo pelos bytes. Levanta ExtractionError se não for suportado."""
    if b"%PDF-" in data[:1024]:
        return FileKind.PDF

    if data.startswith(b"PK\x03\x04"):
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as zf:
                names = set(zf.namelist())
        except zipfile.BadZipFile as exc:
            raise ExtractionError("Arquivo corrompido: não foi possível abri-lo.") from exc
        if "word/document.xml" in names:
            return FileKind.DOCX
        if "content.xml" in names:
            raise ExtractionError("Arquivos .odt não são suportados. Salve como .docx.")
        raise ExtractionError("Formato não suportado. Envie .docx, .pdf ou .txt.")

    if data.startswith(b"\xd0\xcf\x11\xe0"):
        raise ExtractionError("Arquivo .doc antigo não é suportado. Salve como .docx.")
    if data.lstrip().startswith(b"{\\rtf"):
        raise ExtractionError("Arquivos .rtf não são suportados. Salve como .docx.")

    ext = _extension(filename)
    if ext in _TEXT_EXTENSIONS:
        return FileKind.TXT
    raise ExtractionError("Formato não suportado. Envie .docx, .pdf ou .txt.")


def extract(data: bytes, filename: str = "") -> ExtractedText:
    """Extrai o texto de um arquivo enviado pelo usuário."""
    max_bytes = settings.max_upload_mb * 1024 * 1024
    if len(data) > max_bytes:
        raise ExtractionError(f"Arquivo maior que o limite de {settings.max_upload_mb} MB.")
    if not data:
        raise ExtractionError("O arquivo está vazio.")

    kind = detect_kind(data, filename)
    page_count = None
    if kind is FileKind.PDF:
        raw, page_count = _extract_pdf(data)
    elif kind is FileKind.DOCX:
        raw = _extract_docx(data)
    else:
        raw = decode_text(data)

    text = _normalize(raw)
    if not text:
        if kind is FileKind.PDF:
            raise ExtractionError(
                "Não encontramos texto no PDF. Se ele for digitalizado (imagem), "
                "não conseguimos ler o conteúdo."
            )
        raise ExtractionError("Não encontramos texto no arquivo.")

    return ExtractedText(kind=kind, text=text, word_count=count_words(text), page_count=page_count)


# --- formatos -------------------------------------------------------------------


def decode_text(data: bytes) -> str:
    if data.startswith((b"\xff\xfe", b"\xfe\xff")):
        text = _decode(data, "utf-16")
    else:
        # Sem BOM: UTF-8 primeiro; o fallback é cp1252, o padrão do Bloco de Notas
        # antigo no Windows em PT-BR (latin-1 nunca falha, mas erra aspas e travessões).
        text = _decode(data, "utf-8-sig") or _decode(data, "cp1252") or data.decode("latin-1")
    if text is None or "\x00" in text:
        raise ExtractionError("O arquivo não parece ser texto. Envie .docx, .pdf ou .txt.")
    return text


def _decode(data: bytes, encoding: str) -> str | None:
    try:
        return data.decode(encoding)
    except UnicodeDecodeError:
        return None


def _extract_docx(data: bytes) -> str:
    # Import local: python-docx puxa lxml, e só este caminho precisa dele.
    import docx
    from docx.table import Table

    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        if sum(info.file_size for info in zf.infolist()) > MAX_DOCX_UNCOMPRESSED_BYTES:
            raise ExtractionError("O .docx é grande demais depois de descompactado.")

    try:
        document = docx.Document(io.BytesIO(data))
    except Exception as exc:  # python-docx levanta KeyError, lxml, PackageNotFound…
        raise ExtractionError("Arquivo .docx corrompido: não foi possível abri-lo.") from exc

    # Corpo em ordem de leitura, parágrafos e tabelas intercalados. Ficam de fora
    # cabeçalho/rodapé (quase sempre número de página e título repetido), notas de
    # rodapé e caixas de texto — o python-docx não expõe os dois últimos.
    paragraphs: list[str] = []

    def walk(container) -> None:
        for block in container.iter_inner_content():
            if isinstance(block, Table):
                # Célula mesclada aparece repetida em row.cells. Guarda o elemento,
                # não id(): o lxml descarta proxies sem referência e reaproveita ids.
                seen = set()
                for row in block.rows:
                    for cell in row.cells:
                        if cell._tc in seen:
                            continue
                        seen.add(cell._tc)
                        walk(cell)
            else:
                paragraphs.append(_paragraph_text(block._p))

    walk(document)
    return "\n\n".join(paragraphs)


# Runs visíveis do parágrafo, inclusive dentro de alterações controladas (w:ins) —
# o `paragraph.text` do python-docx pula essas, e o texto sairia diferente do que
# o usuário vê no Word. Fora: texto excluído (w:del, w:moveFrom) e caixas de texto
# ancoradas no parágrafo (w:txbxContent), que teriam o conteúdo misturado ao dele.
_RUN_CONTENT_XPATH = (
    "(.//w:r/w:t | .//w:r/w:tab | .//w:r/w:br | .//w:r/w:cr)"
    "[not(ancestor::w:del or ancestor::w:moveFrom or ancestor::w:txbxContent)]"
)


def _paragraph_text(p) -> str:
    parts = []
    for el in p.xpath(_RUN_CONTENT_XPATH):
        tag = el.tag.rsplit("}", 1)[-1]
        if tag == "t":
            parts.append(el.text or "")
        elif tag == "tab":
            parts.append("\t")
        else:
            parts.append("\n")
    return "".join(parts)


def _extract_pdf(data: bytes) -> tuple[str, int]:
    from pypdf import PdfReader
    from pypdf.errors import PdfReadError

    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted and not reader.decrypt(""):
            raise ExtractionError("O PDF está protegido por senha. Remova a senha e envie de novo.")
        page_count = len(reader.pages)
    except ExtractionError:
        raise
    except (PdfReadError, ValueError, KeyError, TypeError) as exc:
        raise ExtractionError("Arquivo PDF corrompido: não foi possível abri-lo.") from exc

    if page_count > MAX_PDF_PAGES:
        raise ExtractionError(f"O PDF tem mais de {MAX_PDF_PAGES} páginas.")

    lines: list[str] = []
    for page in reader.pages:
        try:
            page_text = page.extract_text() or ""
        except Exception as exc:  # fonte/stream malformado numa página específica
            raise ExtractionError("Não foi possível ler o texto de uma das páginas.") from exc
        lines.extend(page_text.splitlines())
        lines.append("")  # quebra de página conta como possível fim de parágrafo

    return _rebuild_pdf_paragraphs(lines), page_count


# Linha de rodapé com só o número da página ("12", "- 12 -", "Página 12").
_PAGE_NUMBER_RE = re.compile(r"^\s*(?:p[áa]gina\s+)?[-–—]?\s*\d{1,4}\s*[-–—]?\s*$", re.IGNORECASE)
_SENTENCE_END = (".", "!", "?", ":", '"', "”", "»", ")")


def _rebuild_pdf_paragraphs(lines: list[str]) -> str:
    """O PDF não tem parágrafo, só linhas posicionadas. Reconstrói por heurística.

    Uma linha fecha o parágrafo quando é seguida de linha em branco, ou quando
    termina em pontuação final E é visivelmente mais curta que uma linha cheia
    (a última linha de um parágrafo justificado raramente vai até a margem).
    O 0.85 é empírico — ajuste se aparecer PDF real que quebre errado.
    """
    lines = [ln.strip() for ln in lines if not _PAGE_NUMBER_RE.match(ln)]
    lengths = [len(ln) for ln in lines if ln]
    if not lengths:
        return ""
    # Percentil 75 como "linha cheia": a mediana puxaria para baixo em textos com
    # muitos parágrafos curtos.
    full_width = statistics.quantiles(lengths, n=4)[-1] if len(lengths) >= 4 else max(lengths)

    paragraphs: list[str] = []
    current = ""
    for line in lines:
        if not line:
            if current:
                paragraphs.append(current)
                current = ""
            continue

        if current.endswith("-") and line[:1].islower():
            # Hifenização de fim de linha: "conti-" + "nuação". Erra no raro caso
            # de palavra composta quebrada exatamente no hífen ("guarda-" + "chuva").
            current = current[:-1] + line
        elif current:
            current = f"{current} {line}"
        else:
            current = line

        if line.endswith(_SENTENCE_END) and len(line) < 0.85 * full_width:
            paragraphs.append(current)
            current = ""

    if current:
        paragraphs.append(current)
    return "\n\n".join(paragraphs)


# --- normalização ---------------------------------------------------------------

_BLANK_LINES_RE = re.compile(r"\n{3,}")
_TRAILING_SPACE_RE = re.compile(r"[ \t]+\n")


def _normalize(text: str) -> str:
    # NFC: PDF costuma vir com acento decomposto ("a" + "◌́"), o que quebra busca,
    # contagem e o próprio detector.
    text = unicodedata.normalize("NFC", text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = _TRAILING_SPACE_RE.sub("\n", text)
    text = _BLANK_LINES_RE.sub("\n\n", text)
    return text.strip()


def _extension(filename: str) -> str:
    dot = filename.rfind(".")
    return filename[dot:].lower() if dot > filename.rfind("/") and dot != -1 else ""
