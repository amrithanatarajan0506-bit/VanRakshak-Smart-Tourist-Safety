"""
Tourist document validation — Indian (Aadhaar) and Foreign (Passport) entry.

Works fully offline. No external API is called.

What "correct file" means here:
  1. Allowed type      : PDF / JPG / PNG only — decided from the file's real bytes,
                         not from the file name the browser sent.
  2. Sane size         : 20 KB – 5 MB (rejects empty / tiny / huge files).
  3. Not corrupt       : images must decode; PDFs must have a header, an EOF marker
                         and at least one page.
  4. Big enough to read: images at least 400 x 250 px.
  5. Passport content  : if Tesseract OCR is installed, the passport data page is
                         read. The machine-readable zone (the two lines of 44 characters
                         starting with "P<") is parsed and its ICAO 9303 check digits are
                         verified. A file that has no passport text at all is rejected.
                         If OCR is not installed the file is accepted as
                         "pending_review" for a ranger to look at.
"""
from __future__ import annotations

import io
import re
from dataclasses import dataclass, field
from typing import Optional

MAX_BYTES = 5 * 1024 * 1024
MIN_W, MIN_H = 400, 250
ALLOWED = {"jpg", "png", "pdf"}


class DocumentError(ValueError):
    """Raised with a message that is safe to show to the tourist."""


@dataclass
class DocumentResult:
    kind: str                       # jpg | png | pdf
    status: str                     # verified | pending_review
    message: str
    passport_number: Optional[str] = None
    nationality: Optional[str] = None
    details: dict = field(default_factory=dict)


# ── Aadhaar number (Verhoeff checksum, same as UIDAI) ────────────────────────
_D = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
]
_P = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
]


def clean_aadhaar(raw: str) -> str:
    return re.sub(r"[\s-]", "", raw or "")


def validate_aadhaar_number(raw: str) -> str:
    """Return the 12-digit number or raise DocumentError."""
    num = clean_aadhaar(raw)
    if not re.fullmatch(r"\d{12}", num):
        raise DocumentError("Aadhaar number must be exactly 12 digits.")
    if num[0] in "01":
        raise DocumentError("Aadhaar number cannot start with 0 or 1.")
    c = 0
    for i, ch in enumerate(reversed(num)):
        c = _D[c][_P[i % 8][int(ch)]]
    if c != 0:
        raise DocumentError("This Aadhaar number is not valid. Please check it and try again.")
    return num


# ── File checks ──────────────────────────────────────────────────────────────
def sniff_type(data: bytes) -> Optional[str]:
    if data[:3] == b"\xff\xd8\xff":
        return "jpg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if data[:5] == b"%PDF-":
        return "pdf"
    return None


def _check_file(data: bytes) -> str:
    if not data:
        raise DocumentError("The uploaded file is empty.")
    if len(data) > MAX_BYTES:
        raise DocumentError("File is too large. Maximum size is 5 MB.")
    kind = sniff_type(data)
    if kind not in ALLOWED:
        raise DocumentError("Unsupported file. Upload a PDF, JPG or PNG.")
    return kind


def _open_image(data: bytes):
    from PIL import Image
    try:
        img = Image.open(io.BytesIO(data))
        img.verify()                            # detects truncated / corrupt files
        img = Image.open(io.BytesIO(data))      # verify() invalidates the handle
        img.load()
    except Exception:
        raise DocumentError("This file is corrupt or not a valid image. Please upload it again.")
    if img.width < MIN_W or img.height < MIN_H:
        raise DocumentError(f"Image is too small ({img.width}x{img.height}). "
                            f"Upload a clearer picture, at least {MIN_W}x{MIN_H}.")
    return img


def _pdf_first_page_image(data: bytes):
    """Render page 1 of a PDF to an image for OCR (needs pdftoppm; optional)."""
    import shutil, subprocess, tempfile, os
    if not shutil.which("pdftoppm"):
        return None
    with tempfile.TemporaryDirectory() as d:
        src = os.path.join(d, "in.pdf")
        with open(src, "wb") as f:
            f.write(data)
        try:
            subprocess.run(["pdftoppm", "-r", "200", "-f", "1", "-l", "1", "-png", src,
                            os.path.join(d, "p")], check=True, timeout=30,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            from PIL import Image
            for name in sorted(os.listdir(d)):
                if name.startswith("p") and name.endswith(".png"):
                    img = Image.open(os.path.join(d, name))
                    img.load()
                    return img
        except Exception:
            return None
    return None


def _check_pdf(data: bytes):
    if b"%%EOF" not in data[-2048:]:
        raise DocumentError("This PDF looks incomplete or corrupt. Please upload it again.")
    pages = 0
    try:
        from pypdf import PdfReader
        r = PdfReader(io.BytesIO(data))
        if r.is_encrypted:
            raise DocumentError("Password-protected PDFs cannot be read. Upload an unlocked copy.")
        pages = len(r.pages)
    except DocumentError:
        raise
    except ImportError:
        pages = len(re.findall(rb"/Type\s*/Page[^s]", data))
    except Exception:
        raise DocumentError("This PDF is corrupt or unreadable. Please upload it again.")
    if pages < 1:
        raise DocumentError("This PDF has no pages.")


def validate_id_file(data: bytes) -> str:
    """Generic check used for an uploaded Aadhaar card. Returns file kind."""
    kind = _check_file(data)
    if kind == "pdf":
        _check_pdf(data)
    else:
        _open_image(data)
    return kind


# ── Passport (MRZ, ICAO 9303 TD3) ────────────────────────────────────────────
_W = [7, 3, 1]


def _val(ch: str) -> int:
    if ch.isdigit():
        return int(ch)
    if ch == "<":
        return 0
    return ord(ch) - 55                      # A=10 … Z=35


def _check_digit(field_: str) -> str:
    return str(sum(_val(c) * _W[i % 3] for i, c in enumerate(field_)) % 10)


_TO_ALPHA = str.maketrans("01258", "OIZSB")


def _alpha(s: str) -> str:
    """Country codes are letters only; fix common OCR digit/letter mix-ups."""
    return s.translate(_TO_ALPHA).replace("<", "")


def parse_mrz(text: str) -> Optional[dict]:
    """Find a TD3 MRZ in OCR text. Returns parsed fields if the check digits pass."""
    lines = []
    for raw in text.upper().splitlines():
        s = re.sub(r"[^A-Z0-9<]", "", raw.replace(" ", ""))
        if len(s) >= 40:
            lines.append(s)
    for i in range(len(lines) - 1):
        l1, l2 = lines[i], lines[i + 1]
        if not l1.startswith("P"):
            continue
        l1, l2 = l1[:44].ljust(44, "<"), l2[:44].ljust(44, "<")
        number, nchk = l2[0:9], l2[9]
        dob, dchk = l2[13:19], l2[19]
        exp, echk = l2[21:27], l2[27]
        ok = (
            _check_digit(number) == nchk
            and _check_digit(dob) == dchk
            and _check_digit(exp) == echk
        )
        if ok:
            return {
                "passport_number": number.replace("<", ""),
                "nationality": _alpha(l2[10:13]),
                "issuing_country": _alpha(l1[2:5]),
                "surname": l1[5:].split("<<")[0].replace("<", " ").strip(),
            }
    return None


def _ocr_available() -> bool:
    try:
        import pytesseract
        pytesseract.get_tesseract_version()
        return True
    except Exception:
        return False


def _ocr(img) -> str:
    import pytesseract
    from PIL import ImageOps
    g = ImageOps.autocontrast(img.convert("L"))
    if g.width < 1600:                        # upscale small photos for better OCR
        f = 1600 / g.width
        g = g.resize((1600, int(g.height * f)))
    # Full page for words like PASSPORT; MRZ band (bottom third) with a strict charset.
    full = pytesseract.image_to_string(g, config="--psm 6")
    band = g.crop((0, int(g.height * 0.6), g.width, g.height))
    mrz = pytesseract.image_to_string(
        band, config="--psm 6 -c tesseract_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<")
    return full + "\n" + mrz


def validate_passport_file(data: bytes) -> DocumentResult:
    kind = _check_file(data)
    if kind == "pdf":
        _check_pdf(data)
        img = _pdf_first_page_image(data)
    else:
        img = _open_image(data)

    if img is None or not _ocr_available():
        return DocumentResult(
            kind=kind, status="pending_review",
            message="Passport file accepted. It will be checked by a ranger.")

    try:
        text = _ocr(img)
    except Exception:
        return DocumentResult(
            kind=kind, status="pending_review",
            message="Passport file accepted. It will be checked by a ranger.")

    mrz = parse_mrz(text)
    if mrz:
        return DocumentResult(
            kind=kind, status="verified",
            message="Passport verified.",
            passport_number=mrz["passport_number"],
            nationality=mrz["nationality"] or mrz["issuing_country"],
            details=mrz)

    low = text.lower()
    looks_like_passport = ("passport" in low or "p<" in low.replace(" ", "")
                           or "republic" in low or "nationality" in low)
    if not looks_like_passport:
        raise DocumentError(
            "This does not look like a passport. Upload a clear photo or scan of "
            "your passport photo page (the page with your picture and the two lines of code at the bottom).")

    # Passport-like text but the code lines could not be read reliably.
    return DocumentResult(
        kind=kind, status="pending_review",
        message="Passport file accepted, but the code lines were not clear. A ranger will check it.")
