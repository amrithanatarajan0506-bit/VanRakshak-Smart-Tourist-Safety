"""Danger zones / Geofences router with 250m Restricted Geofencing & Ranger Dispatch."""
import uuid
import math
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models.geofence import DangerZone
from models.incident import Incident
from models.ranger import Ranger, RangerLocation
from models.user import User
from services.user_display import display_name, display_phone
from middleware.rbac import get_current_user, require_role
from websocket.manager import manager

router = APIRouter(prefix="/danger-zones", tags=["danger-zones"])

IST = timezone(timedelta(hours=5, minutes=30))


def haversine_distance_m(lat1, lon1, lat2, lon2):
    """Calculates great-circle distance between two coordinates in meters."""
    R = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c


class ZoneCreate(BaseModel):
    name: str
    zone_type: str
    center_lat: float
    center_lng: float
    radius_m: float = 250.0
    severity: str = "critical"
    description: Optional[str] = None


class ZoneBreachRequest(BaseModel):
    lat: float
    lng: float
    zone_id: Optional[str] = None
    zone_name: Optional[str] = None
    user_name: Optional[str] = None
    user_phone: Optional[str] = None
    timestamp: Optional[str] = None
    notes: Optional[str] = None


class RouteIntersectionRequest(BaseModel):
    route: dict


def route_intersects_zone(route: dict, zone: DangerZone) -> bool:
    coords = route.get("coordinates", [])
    if not coords:
        return False

    for start, end in zip(coords, coords[1:]):
        segment_m = haversine_distance_m(start[1], start[0], end[1], end[0])
        samples = max(1, math.ceil(segment_m / 25))
        for index in range(samples + 1):
            fraction = index / samples
            lat = start[1] + (end[1] - start[1]) * fraction
            lng = start[0] + (end[0] - start[0]) * fraction
            if haversine_distance_m(lat, lng, zone.center_lat, zone.center_lng) <= zone.radius_m:
                return True

    lat, lng = coords[0][1], coords[0][0]
    return haversine_distance_m(lat, lng, zone.center_lat, zone.center_lng) <= zone.radius_m


@router.get("")
def list_zones(db: Session = Depends(get_db)):
    zones = db.query(DangerZone).filter(
        DangerZone.active.is_(True),
        DangerZone.created_by.isnot(None),
    ).all()
    features = [{
        "type": "Feature",
        "id": z.id,
        "geometry": {"type": "Point", "coordinates": [z.center_lng, z.center_lat]},
        "properties": {
            "name": z.name,
            "zone_type": z.zone_type,
            "radius_m": z.radius_m or 250.0,
            "severity": z.severity or "critical",
            "description": z.description,
        },
    } for z in zones]
    return {"type": "FeatureCollection", "features": features}


@router.post("", status_code=201)
def create_zone(
    body: ZoneCreate,
    current_user: dict = Depends(require_role("control_room")),
    db: Session = Depends(get_db),
):
    if not -90 <= body.center_lat <= 90 or not -180 <= body.center_lng <= 180:
        raise HTTPException(400, "Zone coordinates are outside valid latitude/longitude ranges.")
    if not 1 <= body.radius_m <= 10000:
        raise HTTPException(400, "Zone radius must be between 1 and 10,000 meters.")
    if not body.name.strip():
        raise HTTPException(400, "Zone name is required.")

    zone = DangerZone(
        id=str(uuid.uuid4()),
        name=body.name.strip(),
        zone_type=body.zone_type.strip(),
        center_lat=body.center_lat,
        center_lng=body.center_lng,
        radius_m=body.radius_m,
        severity=body.severity,
        description=body.description,
        active=True,
        created_by=current_user["sub"],
    )
    db.add(zone)
    db.commit()
    db.refresh(zone)
    return {"id": zone.id, "name": zone.name, "radius_m": zone.radius_m}


@router.post("/intersect")
def intersect_route_with_zones(
    body: RouteIntersectionRequest,
    db: Session = Depends(get_db),
):
    zones = db.query(DangerZone).filter(
        DangerZone.active.is_(True),
        DangerZone.created_by.isnot(None),
    ).all()
    intersections = [
        {
            "id": zone.id,
            "name": zone.name,
            "zone_type": zone.zone_type,
            "severity": zone.severity,
            "radius_m": zone.radius_m,
        }
        for zone in zones
        if route_intersects_zone(body.route, zone)
    ]
    return {
        "intersects": bool(intersections),
        "hazard_data_available": bool(zones),
        "zones": intersections,
    }


@router.post("/breach", status_code=201)
async def report_danger_zone_breach(
    body: ZoneBreachRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Triggered when a tourist GPS position enters a 250m restricted zone.
    Transmits user name, phone, coordinates, and IST timestamp to the nearest ranger station.
    """
    zone = db.query(DangerZone).filter(
        DangerZone.id == body.zone_id,
        DangerZone.active.is_(True),
        DangerZone.created_by.isnot(None),
    ).first() if body.zone_id else None
    if not zone:
        raise HTTPException(404, "Active configured hazard zone not found.")
    if haversine_distance_m(body.lat, body.lng, zone.center_lat, zone.center_lng) > zone.radius_m:
        raise HTTPException(400, "Tourist coordinates are outside this hazard zone.")

    user_id = current_user["sub"]
    user = db.query(User).filter(User.id == user_id).first()

    # Determine tourist identity
    user_name = display_name(user, body.user_name)
    user_phone = display_phone(user, body.user_phone)
    user_email = user.email if user and user.email else "Not provided"

    now_utc = datetime.utcnow()
    now_ist = datetime.now(IST)
    ist_time = now_ist.strftime("%Y-%m-%d %I:%M:%S %p IST")
    iso_time = body.timestamp or now_utc.isoformat() + "Z"

    # Find nearest ranger unit
    rangers = db.query(Ranger).all()
    nearest_ranger = None
    min_dist_m = float("inf")

    for r in rangers:
        loc = db.query(RangerLocation).filter(RangerLocation.ranger_id == r.id).order_by(RangerLocation.recorded_at.desc()).first()
        if loc and loc.accuracy_m is not None and now_utc - loc.recorded_at <= timedelta(minutes=2):
            dist = haversine_distance_m(body.lat, body.lng, loc.lat, loc.lng)
            if dist < min_dist_m:
                min_dist_m = dist
                nearest_ranger = r

    assigned_name = nearest_ranger.name if nearest_ranger else None
    assigned_unit = nearest_ranger.unit_id if nearest_ranger else None
    assigned_id = nearest_ranger.id if nearest_ranger else None
    distance_m = round(min_dist_m) if min_dist_m != float("inf") else None
    eta_mins = max(1, round(distance_m / 80.0)) if distance_m is not None else None
    zone_label = zone.name
    dispatch_note = (
        f"Assigned {assigned_name} ({assigned_unit}) — ETA {eta_mins} min (~{distance_m}m)."
        if assigned_unit else "No ranger location is available for automatic dispatch."
    )

    # Create CRITICAL Incident in database
    incident_id = str(uuid.uuid4())
    incident_notes = (
        f"🚨 RESTRICTED 250M ZONE BREACH: {user_name}\n"
        f"Zone: {zone_label}\n"
        f"Phone: {user_phone} | Email: {user_email}\n"
        f"GPS Coordinates: {body.lat:.5f}°N, {body.lng:.5f}°E | Time: {ist_time}\n"
        + dispatch_note
    )

    timeline = [{
        "event": "DETECTED",
        "timestamp": ist_time,
        "actor": "GEOFENCE_SENSOR",
        "notes": f"Tourist entered {zone_label} at {ist_time}",
    }]
    if assigned_unit:
        timeline.append({
            "event": "TEAM_ASSIGNED",
            "timestamp": ist_time,
            "actor": "AUTO_DISPATCH_ENGINE",
            "ranger_unit": assigned_unit,
            "notes": dispatch_note,
        })

    incident = Incident(
        id=incident_id,
        tourist_id=user_id,
        incident_type="RESTRICTED_ZONE_BREACH",
        severity="critical",
        status="TEAM_ASSIGNED" if assigned_unit else "DETECTED",
        lat=body.lat,
        lng=body.lng,
        search_radius_m=250.0,
        ai_confidence=0.99,
        assigned_ranger_id=assigned_id,
        eta_minutes=eta_mins,
        notes=incident_notes,
        created_at=now_utc,
        timeline=timeline,
    )
    db.add(incident)
    db.commit()
    db.refresh(incident)

    # Real-time WebSocket transmission payload
    dispatch_payload = {
        "id": incident.id,
        "type": "RESTRICTED_ZONE_BREACH",
        "incident_type": "RESTRICTED_ZONE_BREACH",
        "incident_id": incident.id,
        "tourist_name": user_name,
        "tourist_phone": user_phone,
        "tourist_email": user_email,
        "lat": body.lat,
        "lng": body.lng,
        "zone_name": zone_label,
        "zone_type": zone.zone_type,
        "radius_m": zone.radius_m,
        "timestamp_ist": ist_time,
        "created_at_ist": ist_time,
        "assigned_unit": assigned_unit,
        "assigned_ranger": assigned_name,
        "distance_m": distance_m,
        "eta_minutes": eta_mins,
        "severity": "critical",
        "notes": incident_notes,
    }

    await manager.emit_incident_created(dispatch_payload)
    await manager.broadcast({
        "type": "RESTRICTED_ZONE_BREACH",
        "data": dispatch_payload,
    }, role="_all")

    return {
        "status": incident.status,
        "incident_id": incident.id,
        "tourist": {
            "name": user_name,
            "phone": user_phone,
            "email": user_email,
            "coordinates": {"lat": body.lat, "lng": body.lng},
            "timestamp": ist_time,
        },
        "assigned_ranger_station": {
            "unit": assigned_unit,
            "ranger_name": assigned_name,
            "distance_m": distance_m,
            "eta_minutes": eta_mins,
        },
        "zone": zone_label,
        "zone_type": zone.zone_type,
        "radius_m": zone.radius_m,
    }
