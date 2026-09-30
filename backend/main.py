"""Updated main.py — sync startup for Python 3.12 + SQLite."""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

import json
from pathlib import Path

from database import init_db
from routers import auth, identity, trips, incidents, danger_zones, rangers, weather, advisories, coverage
from websocket.manager import manager
import uuid

app = FastAPI(
    title="VanRakshak API",
    description="Smart Tourist Safety Monitoring & Incident Response System",
    version="2.5.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
        "*"
    ],
    allow_origin_regex=r"https://.*\.onrender\.com",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(identity.router)
app.include_router(trips.router)
app.include_router(incidents.router)
app.include_router(danger_zones.router)
app.include_router(rangers.router)
app.include_router(weather.router)
app.include_router(advisories.router)
app.include_router(coverage.router)


@app.websocket("/ws/incidents")
async def ws_incidents(websocket: WebSocket, role: str = "_all"):
    await manager.connect(websocket, role=role)
    try:
        while True:
            data = await websocket.receive_json()
            await manager.broadcast({"type": "ECHO", "data": data}, role="_all")
    except WebSocketDisconnect:
        manager.disconnect(websocket, role=role)


@app.on_event("startup")
def startup():
    init_db()
    _seed_default_data()


def _seed_default_data():
    from database import SessionLocal
    from models.ranger import Ranger

    db = SessionLocal()
    try:
        # Predefined hazard geofences for the 4 surveyed places (Kasauli, Dzukou Valley,
        # Goechala, David Scott Trail). Only missing zones are added, so zones created by
        # Control Room operators are never touched.
        from models.geofence import DangerZone
        seed_file = Path(__file__).parent / "seed" / "danger_zones.geojson"
        if seed_file.exists():
            existing = {z.name: z for z in db.query(DangerZone).all()}
            for f in json.loads(seed_file.read_text()).get("features", []):
                p = f["properties"]; coords = f["geometry"]["coordinates"]
                if p["name"] in existing:
                    if existing[p["name"]].created_by is None:
                        existing[p["name"]].created_by = "system:predefined"   # make visible to the map / alerts
                    continue
                db.add(DangerZone(id=str(uuid.uuid4()), name=p["name"], zone_type=p["zone_type"],
                                  center_lat=coords[1], center_lng=coords[0],
                                  radius_m=p.get("radius_m", 250), severity=p.get("severity", "critical"),
                                  description=p.get("description"), created_by="system:predefined"))
            db.commit()

        from models.user import User
        from middleware.rbac import hash_password

        # Seed staff accounts only (Ranger + Admin share one username/password from config).
        # No demo tourists — tourists appear only when they actually enter the app.
        from config import settings
        staff_hash = hash_password(settings.STAFF_PASSWORD)
        for _email, _name, _role in [
            ("admin@vanrakshak.org",  "Control Room Admin", "control_room"),
            ("ranger@vanrakshak.org", "Arjun Singh",        "rescue_team"),
        ]:
            _u = db.query(User).filter(User.email == _email).first()
            if not _u:
                db.add(User(id=str(uuid.uuid4()), full_name=_name, email=_email,
                            password_hash=staff_hash, role=_role, is_verified=True))
            elif not _u.full_name:
                _u.full_name = _name
        db.commit()

        if not db.query(Ranger).first():
            ranger_user = db.query(User).filter(User.email == "ranger@vanrakshak.org").first()
            ranger_uid = ranger_user.id if ranger_user else None

            for unit in [
                    {"unit_id": "RANGER-01", "name": ranger_user.full_name if ranger_user else "Ranger", "unit_type": "ranger", "user_id": ranger_uid},
            ]:
                    db.add(Ranger(id=str(uuid.uuid4()), **unit))

        db.commit()
    finally:
        db.close()


@app.get("/")
def root():
    return {"service": "VanRakshak API", "version": "2.5.0", "status": "operational"}

@app.get("/health")
def health():
    return {"status": "ok"}
