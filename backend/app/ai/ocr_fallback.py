"""
Local Tesseract OCR fallback for image-understanding calls that normally go
through Gemini vision. There is no vision-capable Groq model on this account
(the old llama-3.2 vision models are decommissioned, the newer llama-4
scout/maverick ones aren't available on this key) — so when Gemini fails
(e.g. a billing hold), this extracts whatever text is actually printed on
the image/PDF locally, then hands that text to a Groq *text* model to
structure it into the same schema the primary Gemini path returns.

Weaker than true vision analysis: it only sees text that's legibly printed
on the drawing (room labels, dimensions) and has no sense of the drawing's
visual layout, so an unlabeled or purely graphical blueprint will come back
mostly empty. It's a fallback, not a replacement.
"""
import io
import logging
import os

import pytesseract
from PIL import Image, ImageOps

logger = logging.getLogger("civilai.ocr_fallback")

# The winget/UB-Mannheim Windows build installs here and doesn't reliably land
# on PATH for already-running processes — pointing at it directly avoids that.
_WINDOWS_TESSERACT_PATH = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
if os.name == "nt" and os.path.exists(_WINDOWS_TESSERACT_PATH):
    pytesseract.pytesseract.tesseract_cmd = _WINDOWS_TESSERACT_PATH

# Real architectural/CAD exports are the hard case: thin, low-contrast line
# work with small scattered labels rather than blocks of prose. Default
# Tesseract settings (which assume a page of paragraph text) miss most of
# that, so every image goes through this before OCR.
_UPSCALE_TARGET_PX = 2200


def _preprocess(image: Image.Image) -> Image.Image:
    image = image.convert("L")  # grayscale — drops faint color linework as noise
    image = ImageOps.autocontrast(image, cutoff=1)  # push faint labels toward black/white
    if max(image.size) < _UPSCALE_TARGET_PX:
        scale = _UPSCALE_TARGET_PX / max(image.size)
        image = image.resize((int(image.width * scale), int(image.height * scale)), Image.LANCZOS)
    return image


def _ocr(image: Image.Image) -> str:
    # PSM 11 = "sparse text, no particular order" — matches labels/dimensions
    # scattered around a drawing far better than the default full-page-of-
    # prose assumption.
    return pytesseract.image_to_string(_preprocess(image), config="--psm 11")


def extract_text(file_bytes: bytes, is_pdf: bool = False) -> str:
    """Raw OCR text from an image, or every page of a PDF (rasterized via
    PyMuPDF — already a project dependency — since Tesseract only reads
    images, not PDFs directly)."""
    if is_pdf:
        import fitz  # PyMuPDF
        pages = []
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        try:
            for page in doc:
                pix = page.get_pixmap(dpi=200)
                image = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
                pages.append(_ocr(image))
        finally:
            doc.close()
        return "\n\n".join(pages)

    image = Image.open(io.BytesIO(file_bytes))
    return _ocr(image)
