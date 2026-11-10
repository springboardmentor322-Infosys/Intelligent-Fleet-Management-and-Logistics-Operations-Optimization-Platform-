"""Live-tracking helpers: tracker keys and the WebSocket connection manager.

NOTE: reconstructed from how main.py uses it (hash_key, new_key, manager) after
the original file was accidentally overwritten. Tracker keys are stored as a
SHA-256 hex digest (64 chars, matching vehicles.tracker_key_hash).
"""
import hashlib
import secrets

from fastapi import WebSocket


def new_key() -> str:
    """A fresh random tracker key (shown to the user once)."""
    return secrets.token_urlsafe(32)


def hash_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


class ConnectionManager:
    def __init__(self):
        self.clients: set[WebSocket] = set()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.clients.add(ws)

    def disconnect(self, ws: WebSocket):
        self.clients.discard(ws)

    async def broadcast(self, message: dict):
        dead = []
        for ws in list(self.clients):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()
