"""Incidents router — sync SQLAlchemy with IST Timestamps & Auto Ranger Dispatch."""
import uuid
import math
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models.incident import Incident
from models.user import User
from services.user_display import display_name, display_phone
from models.ranger import Ranger, RangerLocation
from middleware.rbac import get_current_user, require_role
from websocket.manager import manager
import asyncio

router = APIRouter(prefix="/incidents", tags=["incidents"])

IST = timezone(timedelta(hours=5, minutes=30))

VALID_TRANSITIONS = {
    "DETECTED": ["TEAM_ASSIGNED", "ACKNOWLEDGED"],
    "TEAM_ASSIGNED": ["ACKNOWLEDGED", "TEAM_ON_SITE"],
    "ACKNOWLEDGED": ["TEAM_ON_SITE", "RESOLVED"],
    "TEAM_ON_SITE": ["RESOLVED"],
    "RESOLVED": [],
}


def haversine_distance_m(lat1, lon1, lat2, lon2):
    """Calculates great-circle distance between two points in meters."""
    R = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c


class IncidentCreate(BaseModel):
    incident_type: Optional[str] = None
    type: Optional[str] = None
    severity: Optional[str] = "critical"
    lat: Optional[float] = None
    lng: Optional[float] = None
    notes: Optional[str] = None
    message: Optional[str] = None
    user_name: Optional[str] = None
    user_phone: Optional[str] = None
    gnss_accuracy_m: Optional[float] = None
    search_radius_m: Optional[float] = 100.0
    ai_confidence: Optional[float] = None
    fall_confidence: Optional[float] = None


class StatusUpdate(BaseModel):
    new_status: str
    notes: Optional[str] = None


class DispatchUpdate(BaseModel):
    ranger_id: str
    ranger_unit: str
    eta_minutes: float


class DeadReckoningUpdate(BaseModel):
    estimated_lat: float
    estimated_lng: float
    radius_m: float


@router.post("", status_code=201)
async def create_incident(
    body: IncidentCreate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Creates an Emergency SOS or field incident.
    Automatically enriches with Tourist Name, Phone, exact Coordinates, and IST Timestamp.
    Auto-dispatches to the nearest Ranger Station.
    """
    user_id = current_user["sub"]
    user = db.query(User).filter(User.id == user_id).first()

    # Determine user identity
    t_name = display_name(user, body.user_name)
    t_phone = display_phone(user, body.user_phone)
    t_email = user.email if user and user.email else "Not provided"

    inc_type = (body.incident_type or body.type or "EMERGENCY_SOS").upper()
    inc_notes = body.notes or body.message or f"🚨 EMERGENCY SOS triggered by {t_name}. Immediate field response required."

    now_utc = datetime.utcnow()
    now_ist = datetime.now(IST)
    ist_str = now_ist.strftime("%Y-%m-%d %I:%M:%S %p IST")

    # Find nearest ranger if coordinates provided
    assigned_unit = None
    assigned_name = None
    assigned_id = None
    eta_mins = None
    distance_m = None

    if body.lat is not None and body.lng is not None:
        rangers = db.query(Ranger).all()
        min_dist = float("inf")
        for r in rangers:
            loc = db.query(RangerLocation).filter(RangerLocation.ranger_id == r.id).order_by(RangerLocation.recorded_at.desc()).first()
            if loc and loc.accuracy_m is not None and now_utc - loc.recorded_at <= timedelta(minutes=2):
                dist = haversine_distance_m(body.lat, body.lng, loc.lat, loc.lng)
                if dist < min_dist:
                    min_dist = dist
                    assigned_id = r.id
                    assigned_unit = r.unit_id
                    assigned_name = r.name
        if min_dist != float("inf"):
            distance_m = round(min_dist)
            eta_mins = max(1, round(distance_m / 80.0))

    location_note = (
        f"{body.lat:.5f}°N, {body.lng:.5f}°E"
        if body.lat is not None and body.lng is not None
        else "GPS location unavailable"
    )
    enriched_notes = (
        f"🚨 EMERGENCY SOS: {t_name}\n"
        f"Phone: {t_phone} | Email: {t_email}\n"
        f"Location: {location_note}\n"
        f"Time: {ist_str}\n"
        f"Message: {inc_notes}"
    )

    timeline = [{
        "event": "DETECTED",
        "timestamp": ist_str,
        "actor": t_name,
        "notes": f"SOS signal transmitted via App at {ist_str}",
    }]
    if assigned_unit:
        timeline.append({
            "event": "TEAM_ASSIGNED",
            "timestamp": ist_str,
            "actor": "AUTO_DISPATCH_ENGINE",
            "ranger_unit": assigned_unit,
            "notes": f"Dispatched {assigned_name} ({assigned_unit}) — ETA {eta_mins} min (~{distance_m}m)",
        })

    incident_status = "TEAM_ASSIGNED" if assigned_unit else "DETECTED"

    incident = Incident(
        id=str(uuid.uuid4()),
        tourist_id=user_id,
        incident_type=inc_type,
        severity=body.severity or "critical",
        status=incident_status,
        lat=body.lat,
        lng=body.lng,
        search_radius_m=body.search_radius_m or 100.0,
        ai_confidence=body.ai_confidence or 0.95,
        fall_confidence=body.fall_confidence,
        assigned_ranger_id=assigned_id,
        eta_minutes=eta_mins,
        notes=enriched_notes,
        created_at=now_utc,
        timeline=timeline,
    )
    db.add(incident)
    db.commit()
    db.refresh(incident)

    # Real-time WebSocket emission to all Ranger Stations & Control Rooms
    broadcast_data = {
        "id": incident.id,
        "incident_type": incident.incident_type,
        "type": incident.incident_type,
        "severity": incident.severity,
        "lat": incident.lat,
        "lng": incident.lng,
        "status": incident.status,
        "notes": incident.notes,
        "tourist_id": user_id,
        "tourist_name": t_name,
        "tourist_phone": t_phone,
        "tourist_email": t_email,
        "assigned_unit": assigned_unit,
        "assigned_ranger": assigned_name,
        "distance_m": distance_m,
        "eta_minutes": eta_mins,
        "created_at": incident.created_at.isoformat(),
        "created_at_ist": ist_str,
    }

    await manager.emit_incident_created(broadcast_data)
    await manager.broadcast({
        "type": "SOS_ALERT",
        "data": broadcast_data,
    }, role="_all")

    return {
        "id": incident.id,
        "status": incident.status,
        "incident_type": incident.incident_type,
        "tourist": {
            "name": t_name,
            "phone": t_phone,
            "email": t_email,
            "coordinates": {"lat": incident.lat, "lng": incident.lng},
            "timestamp_ist": ist_str,
        },
        "assigned_ranger_station": {
            "unit": assigned_unit,
            "ranger_name": assigned_name,
            "distance_m": distance_m,
            "eta_minutes": eta_mins,
        },
        "created_at_ist": ist_str,
    }


@router.get("")
async def list_incidents(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    q = db.query(Incident)
    if current_user["role"] == "tourist":
        q = q.filter(Incident.tourist_id == current_user["sub"])
    if status:
        q = q.filter(Incident.status == status)

    incidents = q.order_by(Incident.created_at.desc()).all()
    results = []

    for i in incidents:
        user = db.query(User).filter(User.id == i.tourist_id).first()
        t_name = display_name(user)
        t_phone = display_phone(user)

        # Calculate IST string
        ist_dt = i.created_at.replace(tzinfo=timezone.utc).astimezone(IST) if i.created_at else datetime.now(IST)
        ist_str = ist_dt.strftime("%Y-%m-%d %I:%M:%S %p IST")

        assigned_unit = "RANGER-01"
        if i.assigned_ranger_id:
            r = db.query(Ranger).filter(Ranger.id == i.assigned_ranger_id).first()
            if r:
                assigned_unit = r.unit_id

        results.append({
            "id": i.id,
            "incident_type": i.incident_type,
            "type": i.incident_type,
            "severity": i.severity,
            "status": i.status,
            "lat": i.lat,
            "lng": i.lng,
            "notes": i.notes,
            "tourist_name": t_name,
            "tourist_phone": t_phone,
            "assigned_unit": assigned_unit,
            "eta_minutes": i.eta_minutes,
            "created_at": i.created_at.isoformat() if i.created_at else None,
            "created_at_ist": ist_str,
        })

    return results


@router.get("/{incident_id}")
async def get_incident(
    incident_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(404, "Incident not found")
    if current_user["role"] == "tourist" and inc.tourist_id != current_user["sub"]:
        raise HTTPException(403, "Not your incident")

    user = db.query(User).filter(User.id == inc.tourist_id).first()
    t_name = display_name(user)
    t_phone = display_phone(user)

    ist_dt = inc.created_at.replace(tzinfo=timezone.utc).astimezone(IST) if inc.created_at else datetime.now(IST)
    ist_str = ist_dt.strftime("%Y-%m-%d %I:%M:%S %p IST")

    return {
        "id": inc.id,
        "incident_type": inc.incident_type,
        "type": inc.incident_type,
        "severity": inc.severity,
        "status": inc.status,
        "lat": inc.lat,
        "lng": inc.lng,
        "search_radius_m": inc.search_radius_m,
        "ai_confidence": inc.ai_confidence,
        "assigned_ranger_id": inc.assigned_ranger_id,
        "eta_minutes": inc.eta_minutes,
        "timeline": inc.timeline,
        "notes": inc.notes,
        "tourist_name": t_name,
        "tourist_phone": t_phone,
        "fall_confidence": inc.fall_confidence,
        "dr_estimated_lat": inc.dr_estimated_lat,
        "dr_estimated_lng": inc.dr_estimated_lng,
        "dr_radius_m": inc.dr_radius_m,
        "created_at": inc.created_at.isoformat() if inc.created_at else None,
        "created_at_ist": ist_str,
    }


@router.patch("/{incident_id}/status")
async def update_status(
    incident_id: str,
    body: StatusUpdate,
    current_user: dict = Depends(require_role("rescue_team", "control_room")),
    db: Session = Depends(get_db)
):
    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(404, "Incident not found")
    if body.new_status not in VALID_TRANSITIONS.get(inc.status, []):
        raise HTTPException(400, f"Invalid transition: {inc.status} -> {body.new_status}")

    now_ist = datetime.now(IST).strftime("%Y-%m-%d %I:%M:%S %p IST")
    inc.status = body.new_status
    inc.updated_at = datetime.utcnow()
    if body.new_status == "RESOLVED":
        inc.resolved_at = datetime.utcnow()

    inc.timeline = (inc.timeline or []) + [{
        "event": body.new_status,
        "timestamp": now_ist,
        "actor": current_user["sub"],
        "notes": body.notes,
    }]
    db.commit()
    await manager.emit_status_update(incident_id, body.new_status, current_user["sub"])
    return {"id": incident_id, "status": inc.status}


@router.patch("/{incident_id}/dispatch")
async def dispatch_ranger(
    incident_id: str,
    body: DispatchUpdate,
    current_user: dict = Depends(require_role("control_room")),
    db: Session = Depends(get_db)
):
    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(404, "Incident not found")
    now_ist = datetime.now(IST).strftime("%Y-%m-%d %I:%M:%S %p IST")
    inc.assigned_ranger_id = body.ranger_id
    inc.eta_minutes = body.eta_minutes
    inc.status = "TEAM_ASSIGNED"
    inc.timeline = (inc.timeline or []) + [{
        "event": "TEAM_ASSIGNED",
        "timestamp": now_ist,
        "actor": current_user["sub"],
        "ranger_unit": body.ranger_unit,
    }]
    db.commit()
    await manager.emit_dispatch(incident_id, body.ranger_unit, body.eta_minutes)
    return {"id": incident_id, "assigned": body.ranger_unit, "eta_minutes": body.eta_minutes}


@router.patch("/{incident_id}/dead-reckoning")
async def update_dead_reckoning(
    incident_id: str,
    body: DeadReckoningUpdate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(404, "Incident not found")
    inc.dr_estimated_lat = body.estimated_lat
    inc.dr_estimated_lng = body.estimated_lng
    inc.dr_radius_m = body.radius_m
    inc.dr_last_updated = datetime.utcnow()
    db.commit()
    await manager.emit_dead_reckoning(inc.tourist_id, body.estimated_lat, body.estimated_lng, body.radius_m)
    return {"ok": True, "radius_m": body.radius_m}
