"""
WebSocket Connection Manager — VanRakshak
Extends NIRS-v2.4 WS manager with new message types.
Existing message types (INCIDENT_CREATED, STATUS_UPDATE, DISPATCH) unchanged.

NEW message types:
  RANGER_LOCATION_UPDATE  — ranger pushed GPS fix
  DANGER_ZONE_ALERT       — tourist entered danger zone radius
  RESPONDER_ETA_UPDATE    — assigned ranger ETA changed
  DEAD_RECKONING_UPDATE   — tourist offline, dead-reckoning estimate synced
"""

import json
from typing import Dict, List
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        # role → list of active WebSocket connections
        self.active: Dict[str, List[WebSocket]] = {
            "control_room": [],
            "tourist": [],
            "rescue_team": [],
            "_all": [],
        }

    async def connect(self, websocket: WebSocket, role: str = "_all"):
        await websocket.accept()
        self.active.setdefault(role, []).append(websocket)
        self.active["_all"].append(websocket)

    def disconnect(self, websocket: WebSocket, role: str = "_all"):
        for lst in self.active.values():
            if websocket in lst:
                lst.remove(websocket)

    async def broadcast(self, message: dict, role: str = "_all"):
        """Send to all connections of a given role (or _all)."""
        targets = self.active.get(role, self.active["_all"])
        dead = []
        for ws in targets:
            try:
                await ws.send_text(json.dumps(message))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws, role)

    async def send_to_tourist(self, tourist_id: str, message: dict):
        """Targeted send — tourist_id is matched in their JWT payload (stored on connect)."""
        # Simple broadcast to tourist role for now; production: map tourist_id → ws
        await self.broadcast(message, role="tourist")

    # ── Message factory helpers ───────────────────────────────────────────────

    async def emit_incident_created(self, incident: dict):
        await self.broadcast({"type": "INCIDENT_CREATED", **incident})

    async def emit_status_update(self, incident_id: str, status: str, actor: str):
        await self.broadcast({"type": "STATUS_UPDATE", "incident_id": incident_id,
                               "status": status, "actor": actor})

    async def emit_dispatch(self, incident_id: str, ranger_unit: str, eta_minutes: float):
        await self.broadcast({"type": "DISPATCH", "incident_id": incident_id,
                               "ranger_unit": ranger_unit, "eta_minutes": eta_minutes})

    # NEW message types ───────────────────────────────────────────────────────

    async def emit_ranger_location(self, ranger_id: str, lat: float, lng: float):
        await self.broadcast({
            "type": "RANGER_LOCATION_UPDATE",
            "ranger_id": ranger_id,
            "lat": lat,
            "lng": lng,
        })

    async def emit_danger_zone_alert(self, zone_id: str, tourist_id: str, distance_m: float):
        await self.broadcast({
            "type": "DANGER_ZONE_ALERT",
            "zone_id": zone_id,
            "tourist_id": tourist_id,
            "distance_m": round(distance_m, 1),
        })

    async def emit_responder_eta(self, incident_id: str, eta_minutes: float,
                                  ranger_lat: float, ranger_lng: float):
        await self.broadcast({
            "type": "RESPONDER_ETA_UPDATE",
            "incident_id": incident_id,
            "eta_minutes": eta_minutes,
            "ranger_lat": ranger_lat,
            "ranger_lng": ranger_lng,
        })

    async def emit_dead_reckoning(self, tourist_id: str, estimated_lat: float,
                                   estimated_lng: float, radius_m: float):
        await self.broadcast({
            "type": "DEAD_RECKONING_UPDATE",
            "tourist_id": tourist_id,
            "estimated_lat": estimated_lat,
            "estimated_lng": estimated_lng,
            "radius_m": round(radius_m, 1),
        })


# Singleton instance shared across the app
manager = ConnectionManager()
