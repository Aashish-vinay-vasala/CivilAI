import google.generativeai as genai
from app.config import settings

genai.configure(api_key=settings.GEMINI_API_KEY)
model = genai.GenerativeModel("gemini-1.5-flash")

def analyze_image(image_data: bytes, prompt: str):
    import PIL.Image
    import io
    image = PIL.Image.open(io.BytesIO(image_data))
    response = model.generate_content([prompt, image])
    return response.text

def analyze_text(text: str, prompt: str):
    response = model.generate_content(f"{prompt}\n\n{text}")
    return response.text