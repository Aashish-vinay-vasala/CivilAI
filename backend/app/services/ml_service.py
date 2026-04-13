import httpx
import os

ML_API_URL = os.getenv("ML_API_URL", "http://localhost:8001")

async def predict_cost_overrun(data: dict) -> dict:
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{ML_API_URL}/predict/cost-overrun",
            json=data
        )
        return response.json()

async def predict_delay(data: dict) -> dict:
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{ML_API_URL}/predict/delay",
            json=data
        )
        return response.json()

async def predict_safety_risk(data: dict) -> dict:
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{ML_API_URL}/predict/safety-risk",
            json=data
        )
        return response.json()

async def predict_turnover(data: dict) -> dict:
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{ML_API_URL}/predict/turnover",
            json=data
        )
        return response.json()

async def predict_equipment_failure(data: dict) -> dict:
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{ML_API_URL}/predict/equipment-failure",
            json=data
        )
        return response.json()

async def get_material_prices() -> list:
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{ML_API_URL}/data/material-prices"
        )
        return response.json()

async def get_safety_stats() -> dict:
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{ML_API_URL}/data/safety-stats"
        )
        return response.json()

async def get_delay_stats() -> dict:
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{ML_API_URL}/data/delay-stats"
        )
        return response.json()

async def get_workforce_stats() -> dict:
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{ML_API_URL}/data/workforce-stats"
        )
        return response.json()

async def get_equipment_stats() -> dict:
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{ML_API_URL}/data/equipment-stats"
        )
        return response.json()