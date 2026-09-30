"""Rangers router — sync SQLAlchemy."""
import uuid
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models.ranger import Ranger, RangerLocation
from services.spatial_backend import haversine_distance_m
from middleware.rbac import get_current_user, require_role
from websocket.manager import manager
import asyncio

router = APIRouter(prefix="/rangers", tags=["rangers"])


class LocationUpdate(BaseModel):
    lat: float
    lng: float
    accuracy_m: Optional[float] = None


class NearbyRequest(BaseModel):
    lat: float
    lng: float
    radius_m: float = 5000


@router.get("")
def list_rangers(current_user: dict = Depends(require_role("control_room")), db: Session = Depends(get_db)):
    rangers = db.query(Ranger).all()
    result = []
    now = datetime.utcnow()
    for r in rangers:
        loc = db.query(RangerLocation).filter(RangerLocation.ranger_id == r.id)\
                .order_by(RangerLocation.recorded_at.desc()).first()
        is_live = bool(loc and loc.accuracy_m is not None and now - loc.recorded_at <= timedelta(minutes=2))
        result.append({
            "id": r.id, "unit_id": r.unit_id, "name": r.name,
            "unit_type": r.unit_type, "status": r.status,
            "lat": loc.lat if is_live else None, "lng": loc.lng if is_live else None,
            "accuracy_m": loc.accuracy_m if is_live else None,
            "last_updated": loc.recorded_at.isoformat() if is_live else None,
        })
    return result


@router.patch("/{ranger_id}/location")
async def update_ranger_location(
    ranger_id: str, body: LocationUpdate,
    current_user: dict = Depends(require_role("rescue_team", "control_room")),
    db: Session = Depends(get_db),
):
    ranger = db.query(Ranger).filter(Ranger.id == ranger_id).first()
    if not ranger: raise HTTPException(404, "Ranger not found")

    loc = RangerLocation(ranger_id=ranger_id, lat=body.lat, lng=body.lng,
                         accuracy_m=body.accuracy_m, recorded_at=datetime.utcnow())
    db.add(loc); db.commit()

    # Broadcast via WS
    await manager.emit_ranger_location(ranger_id, body.lat, body.lng)

    # Prune old rows (keep last 100)
    all_locs = db.query(RangerLocation).filter(RangerLocation.ranger_id == ranger_id)\
                  .order_by(RangerLocation.recorded_at.desc()).all()
    for old in all_locs[100:]:
        db.delete(old)
    db.commit()
    return {"ranger_id": ranger_id, "lat": body.lat, "lng": body.lng, "ok": True}



@router.post("/nearby")
def rangers_nearby(body: NearbyRequest, current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    rangers = db.query(Ranger).all()
    result = []
    for r in rangers:
        loc = db.query(RangerLocation).filter(RangerLocation.ranger_id == r.id)\
                .order_by(RangerLocation.recorded_at.desc()).first()
        if not loc or loc.accuracy_m is None or datetime.utcnow() - loc.recorded_at > timedelta(minutes=2): continue
        d = haversine_distance_m(body.lat, body.lng, loc.lat, loc.lng)
        if d <= body.radius_m:
            result.append({"id": r.id, "unit_id": r.unit_id, "name": r.name,
                           "unit_type": r.unit_type, "status": r.status,
                           "lat": loc.lat, "lng": loc.lng, "distance_m": round(d, 1)})
    result.sort(key=lambda x: x["distance_m"])
    return result
