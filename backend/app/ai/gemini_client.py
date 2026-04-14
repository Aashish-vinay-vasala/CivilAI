from google import genai
from google.genai import types
from app.config import settings
import PIL.Image
import io

client = genai.Client(api_key=settings.GEMINI_API_KEY)

def analyze_image(image_data: bytes, prompt: str):
    image = PIL.Image.open(io.BytesIO(image_data))
    response = client.models.generate_content(
        model="gemini-1.5-flash",
        contents=[prompt, image]
    )
    return response.text

def analyze_text(text: str, prompt: str):
    response = client.models.generate_content(
        model="gemini-1.5-flash",
        contents=f"{prompt}\n\n{text}"
    )
    return response.text