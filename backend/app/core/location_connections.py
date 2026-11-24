
import asyncio
import json

from fastapi import WebSocket


class LocationConnectionManager:
    def __init__(self):
        self.active_connections: set[WebSocket] = set()
        self.lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()

        async with self.lock:
            self.active_connections.add(websocket)

    async def disconnect(self, websocket: WebSocket):
        async with self.lock:
            self.active_connections.discard(websocket)

    async def broadcast_location(self, location: dict):
        message = json.dumps({
            "type": "driver_location_updated",
            "location": location,
        })

        async with self.lock:
            connections = list(self.active_connections)

        disconnected = []

        for websocket in connections:
            try:
                await websocket.send_text(message)
            except Exception:
                disconnected.append(websocket)

        for websocket in disconnected:
            await self.disconnect(websocket)


location_manager = LocationConnectionManager()
