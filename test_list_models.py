import asyncio
from httpx import AsyncClient

async def test():
    async with AsyncClient() as client:
        # Assuming we just want to see how to fetch and parse gemini models
        # But we need an API key to fetch. If we don't have one, we can just write the parser.
        pass

