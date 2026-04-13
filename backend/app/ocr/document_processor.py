import pymupdf
import pdfplumber
import openpyxl
import docx
from PIL import Image
import io
from app.ai.gemini_client import analyze_image, analyze_text
from app.ai.groq_client import analyze_document

def extract_pdf_text(file_bytes: bytes) -> str:
    text = ""
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            text += page.extract_text() or ""
    return text

def extract_pdf_images(file_bytes: bytes) -> list:
    images = []
    doc = pymupdf.open(stream=file_bytes, filetype="pdf")
    for page in doc:
        pix = page.get_pixmap()
        images.append(pix.tobytes("png"))
    return images

def extract_excel(file_bytes: bytes) -> str:
    wb = openpyxl.load_workbook(io.BytesIO(file_bytes))
    text = ""
    for sheet in wb.sheetnames:
        ws = wb[sheet]
        text += f"Sheet: {sheet}\n"
        for row in ws.iter_rows(values_only=True):
            text += " | ".join([str(c) for c in row if c]) + "\n"
    return text

def extract_word(file_bytes: bytes) -> str:
    doc = docx.Document(io.BytesIO(file_bytes))
    return "\n".join([p.text for p in doc.paragraphs])

def process_document(file_bytes: bytes, filename: str, prompt: str = None) -> dict:
    ext = filename.split(".")[-1].lower()
    text = ""
    
    if ext == "pdf":
        text = extract_pdf_text(file_bytes)
        if not text.strip():
            images = extract_pdf_images(file_bytes)
            if images:
                text = analyze_image(
                    images[0],
                    "Extract all text from this document"
                )
    elif ext in ["xlsx", "xls"]:
        text = extract_excel(file_bytes)
    elif ext in ["docx", "doc"]:
        text = extract_word(file_bytes)
    elif ext in ["png", "jpg", "jpeg"]:
        text = analyze_image(
            file_bytes,
            "Extract all text and data from this image"
        )
    
    analysis = None
    if prompt and text:
        analysis = analyze_document(text, prompt)
    
    return {
        "filename": filename,
        "extracted_text": text,
        "analysis": analysis
    }