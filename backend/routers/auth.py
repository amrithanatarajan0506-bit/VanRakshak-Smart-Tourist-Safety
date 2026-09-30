"""Auth router — /auth/* endpoints (sync SQLAlchemy)."""
import uuid
import random
import math
from datetime import datetime, timezone, timedelta
from typing import Optional

import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models.geofence import DangerZone
from models.trip import Trip
from models.tourist_location import TouristLocation
from models.user import DigitalTouristID, IdentityRecord, User
from middleware.rbac import (
    hash_password, verify_password,
    create_access_token, create_refresh_token,
    decode_token, get_current_user, require_role,
)
from config import settings
from services.document_validation import DocumentError
from services.identity_service import verify_aadhaar, verify_passport
from services.hash_chain import mint_digital_tourist_id

router = APIRouter(prefix="/auth", tags=["auth"])

IST = timezone(timedelta(hours=5, minutes=30))

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Ranger and Admin (Control Room) share ONE username + password.
# The console they pick decides which seeded staff account is used.
STAFF_ACCOUNTS = {
    "rescue_team":  "ranger@vanrakshak.org",
    "control_room": "admin@vanrakshak.org",
}


def _ist_str(dt):
    if not dt:
        return None
    return dt.replace(tzinfo=timezone.utc).astimezone(IST).strftime("%Y-%m-%d %I:%M:%S %p IST")


def _distance_m(lat1, lng1, lat2, lng2):
    earth_radius_m = 6_371_000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lng = math.radians(lng2 - lng1)
    haversine = math.sin(delta_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lng / 2) ** 2
    return earth_radius_m * 2 * math.atan2(math.sqrt(haversine), math.sqrt(1 - haversine))


def _proximity_risk(user, zones):
    if user.last_lat is None or user.last_lng is None:
        return {"risk_level": "UNAVAILABLE", "risk_score": None, "risk_reason": "No live location fix"}
    if not zones:
        return {"risk_level": "UNASSESSED", "risk_score": None, "risk_reason": "No configured geofences"}

    nearest = min(zones, key=lambda zone: _distance_m(
        user.last_lat, user.last_lng, zone.center_lat, zone.center_lng
    ))
    distance = _distance_m(user.last_lat, user.last_lng, nearest.center_lat, nearest.center_lng)
    radius = float(nearest.radius_m or 250)
    zone_type = (nearest.zone_type or "").lower()
    restricted = any(term in zone_type for term in ("restricted", "prohibited", "no_entry"))
    if distance <= radius:
        level = "HIGH" if restricted or (nearest.severity or "").lower() == "critical" else "ELEVATED"
        score = 85 if level == "HIGH" else 65
        reason = f"Inside {nearest.name} boundary ({round(distance)}m from center)"
    elif distance <= radius * 2:
        level, score = "ELEVATED", 40
        reason = f"Near {nearest.name} boundary ({round(distance)}m from center)"
    else:
        level, score = "LOW", 10
        reason = f"Outside configured zones; nearest is {nearest.name} ({round(distance)}m)"
    return {"risk_level": level, "risk_score": score, "risk_reason": reason}


def _session_payload(user, db):
    """Token + profile payload returned by every sign-in flow."""
    token_data = {"sub": user.id, "role": user.role}
    ranger_id = None
    if user.role == "rescue_team":
        from models.ranger import Ranger
        ranger = db.query(Ranger).filter(Ranger.user_id == user.id).first()
        if ranger:
            ranger_id = ranger.id
    return {
        "access_token": create_access_token(token_data),
        "refresh_token": create_refresh_token(token_data),
        "token_type": "bearer",
        "user_id": user.id,
        "role": user.role,
        "ranger_id": ranger_id,
        "full_name": user.full_name,
        "email": user.email,
        "phone": user.phone,
    }

# In-memory OTP store (production: Redis with TTL)
_otp_store: dict = {}


class RegisterRequest(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    password: str
    role: str = "tourist"


class LoginRequest(BaseModel):
    identifier: str
    password: Optional[str] = None


class StaffLoginRequest(BaseModel):
    username: str
    password: str
    role: str = "rescue_team"        # rescue_team (Ranger) | control_room (Admin)


class GuestRequest(BaseModel):
    full_name: str
    phone: str


class TouristEntryRequest(BaseModel):
    tourist_type: str
    full_name: str
    phone: str
    email: str
    aadhaar_number: Optional[str] = None
    passport_number: Optional[str] = None


class TouristLocationRequest(BaseModel):
    lat: float
    lng: float
    accuracy_m: Optional[float] = None
    speed_kmh: Optional[float] = None


class OTPVerifyRequest(BaseModel):
    identifier: str
    otp: str


class RefreshRequest(BaseModel):
    refresh_token: str


@router.post("/register", status_code=201)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    if not body.phone and not body.email:
        raise HTTPException(400, "Phone or email required")
    # Treat blank strings from the form as "not provided"
    body.phone = (body.phone or "").strip() or None
    body.email = (body.email or "").strip() or None
    full_name = (body.full_name or "").strip() or None
    if not body.phone and not body.email:
        raise HTTPException(400, "Phone or email required")
    from sqlalchemy import or_
    conditions = []
    if body.phone is not None:
        conditions.append(User.phone == body.phone)
    if body.email is not None:
        conditions.append(User.email == body.email)

    existing = db.query(User).filter(or_(*conditions)).first() if conditions else None
    if existing:
        raise HTTPException(409, "Account already exists with this phone/email")


    otp = str(random.randint(100000, 999999))
    identifier = body.phone or body.email
    _otp_store[identifier] = otp

    user = User(
        id=str(uuid.uuid4()),
        full_name=full_name,
        phone=body.phone,
        email=body.email,
        password_hash=hash_password(body.password),
        role="tourist",              # public sign-up can only ever create tourists
        is_verified=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "message": "Registration successful. OTP sent.",
        "user_id": user.id,
        "otp_demo": otp,  # REMOVE IN PRODUCTION
    }


@router.post("/verify-otp")
def verify_otp(body: OTPVerifyRequest, db: Session = Depends(get_db)):
    stored_otp = _otp_store.get(body.identifier)
    if not stored_otp or stored_otp != body.otp:
        raise HTTPException(401, "Invalid or expired OTP")
    del _otp_store[body.identifier]

    user = db.query(User).filter(
        (User.phone == body.identifier) | (User.email == body.identifier)
    ).first()
    if not user:
        raise HTTPException(404, "User not found")
    user.is_verified = True
    db.commit()

    return _session_payload(user, db)


@router.post("/login")
def login(body: LoginRequest, db: Session = Depends(get_db)):
    """Password login — staff accounts only. Tourists use /auth/guest instead."""
    user = db.query(User).filter(
        (User.phone == body.identifier) | (User.email == body.identifier)
    ).first()
    if not user or user.role == "tourist":
        raise HTTPException(401, "Login is only for Ranger / Admin accounts.")
    if not body.password or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Incorrect password.")
    user.last_login_at = datetime.utcnow()
    db.commit()
    return _session_payload(user, db)


@router.post("/staff-login")
def staff_login(body: StaffLoginRequest, db: Session = Depends(get_db)):
    """Ranger + Admin sign in with the same shared username / password."""
    if body.role not in STAFF_ACCOUNTS:
        raise HTTPException(400, "Choose Ranger or Admin console.")
    if body.username.strip() != settings.STAFF_USERNAME or body.password != settings.STAFF_PASSWORD:
        raise HTTPException(401, "Incorrect username or password.")
    user = db.query(User).filter(User.email == STAFF_ACCOUNTS[body.role]).first()
    if not user:
        raise HTTPException(500, "Staff account is not set up.")
    user.last_login_at = datetime.utcnow()
    db.commit()
    return _session_payload(user, db)


@router.post("/guest")
def guest_entry():
    """Retired — tourists must use /auth/tourist-entry with typed identity details."""
    raise HTTPException(410, "Use tourist entry with identity details instead.")


@router.post("/tourist-entry")
def tourist_entry(
    body: TouristEntryRequest,
    db: Session = Depends(get_db),
):
    """
    Tourist entry. Always creates / updates a *tourist* account — this endpoint can never
    return a Ranger or Admin session, and it refuses phone/email that belong to staff.
    """
    from models.user import IdentityRecord
    tourist_type = body.tourist_type.strip().lower()
    if tourist_type not in ("indian", "foreign"):
        raise HTTPException(400, "Choose Indian or Foreign tourist.")

    name = body.full_name.strip()
    email = body.email.strip().lower()
    phone = re.sub(r"[\s()-]", "", body.phone)
    if len(name) < 2 or len(name) > 100 or not any(ch.isalpha() for ch in name):
        raise HTTPException(422, "Enter a valid full name (2 to 100 characters).")
    if not EMAIL_RE.match(email):
        raise HTTPException(422, "Enter a valid email address.")
    if not re.fullmatch(r"\+?\d{7,15}", phone):
        raise HTTPException(422, "Enter a phone number containing 7 to 15 digits.")

    # ── Typed identity-number validation ────────────────────────────────────
    id_type = "aadhaar" if tourist_type == "indian" else "passport"
    nationality = "IN"
    try:
        if tourist_type == "indian":
            number = (body.aadhaar_number or "").strip()
            if not number:
                raise HTTPException(422, "Enter your Aadhaar number.")
            identity_result = verify_aadhaar(number)
        else:
            number = (body.passport_number or "").strip()
            if not number:
                raise HTTPException(422, "Enter your passport number.")
            identity_result = verify_passport(number, nationality="XX")
    except DocumentError as exc:
        raise HTTPException(422, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422, "Passport number format is invalid.") from exc

    verification = "format_validated"

    # ── Find / create the tourist (never a staff account) ───────────────────
    by_phone = db.query(User).filter(User.phone == phone).first()
    by_email = db.query(User).filter(User.email == email).first()
    for u in (by_phone, by_email):
        if u is not None and u.role != "tourist":
            raise HTTPException(409, "This phone number or email is reserved.")
    if by_phone and by_email and by_phone.id != by_email.id:
        raise HTTPException(409, "Phone and email belong to different tourists.")
    user = by_phone or by_email
    if not user:
        user = User(
            id=str(uuid.uuid4()),
            phone=phone,
            email=email,
            password_hash=hash_password(str(uuid.uuid4())),   # unusable random password
            role="tourist",
        )
        db.add(user)
    user.full_name = name
    user.phone = phone
    user.email = email
    user.is_verified = False
    user.last_login_at = datetime.utcnow()
    db.flush()

    record = db.query(IdentityRecord).filter(IdentityRecord.user_id == user.id).first()
    if record is None:
        record = IdentityRecord(id=str(uuid.uuid4()), user_id=user.id)
        db.add(record)
    record.id_type = id_type
    record.id_hash = identity_result["id_hash"]
    record.id_salt = identity_result["id_salt"]
    record.nationality = nationality
    record.verification_status = verification
    record.verified_at = None
    record.document_path = None

    digital_id = db.query(DigitalTouristID).filter(DigitalTouristID.user_id == user.id).first()
    if digital_id is None:
        digital_id = DigitalTouristID(**mint_digital_tourist_id(user.id, None))
        db.add(digital_id)

    db.commit()
    db.refresh(user)

    payload = _session_payload(user, db)
    payload["tourist_type"] = tourist_type
    payload["verification_status"] = verification
    payload["dtid_code"] = digital_id.dtid_code
    return payload


@router.get("/tourists")
def list_tourists(
    current_user: dict = Depends(require_role("rescue_team", "control_room")),
    db: Session = Depends(get_db),
):
    """Tourists who have entered the app — shown to Rangers and Admin."""
    rows = (
        db.query(User)
        .filter(User.role == "tourist", User.last_login_at.isnot(None))
        .order_by(User.last_login_at.desc())
        .all()
    )
    ids = {r.user_id: r for r in db.query(IdentityRecord).filter(
        IdentityRecord.user_id.in_([u.id for u in rows] or [""])).all()}
    digital_ids = {item.user_id: item for item in db.query(DigitalTouristID).filter(
        DigitalTouristID.user_id.in_([u.id for u in rows] or [""])).all()}
    trips = {}
    for trip in db.query(Trip).filter(Trip.user_id.in_([u.id for u in rows] or [""])).order_by(Trip.created_at.desc()).all():
        trips.setdefault(trip.user_id, []).append({
            "destination": trip.destination,
            "start_date": trip.start_date.isoformat() if trip.start_date else None,
            "end_date": trip.end_date.isoformat() if trip.end_date else None,
            "status": trip.status,
            "emergency_contact_name": trip.emergency_contact_name,
            "created_at": trip.created_at.isoformat() + "Z" if trip.created_at else None,
        })
    zones = db.query(DangerZone).filter(
        DangerZone.active.is_(True), DangerZone.created_by.isnot(None)
    ).all()
    return [
        {
            "id": u.id,
            "full_name": u.full_name or "Unknown Tourist",
            "phone": u.phone or "Not provided",
            "email": u.email,
            "tourist_type": ("indian" if ids[u.id].id_type == "aadhaar" else "foreign") if u.id in ids else None,
            "verification_status": ids[u.id].verification_status if u.id in ids else None,
            "dtid_code": digital_ids[u.id].dtid_code if u.id in digital_ids else None,
            "lat": u.last_lat,
            "lng": u.last_lng,
            "accuracy_m": u.location_accuracy_m,
            "speed_kmh": u.location_speed_kmh,
            "location_updated_at": u.location_updated_at.isoformat() + "Z" if u.location_updated_at else None,
            **_proximity_risk(u, zones),
            "last_login_at": u.last_login_at.isoformat() + "Z",
            "last_login_ist": _ist_str(u.last_login_at),
            **({
                "identity_type": ids[u.id].id_type if u.id in ids else None,
                "nationality": ids[u.id].nationality if u.id in ids else None,
                "passport_country": ids[u.id].passport_country if u.id in ids else None,
                "identity_verified_at": ids[u.id].verified_at.isoformat() + "Z" if u.id in ids and ids[u.id].verified_at else None,
                "identity_created_at": ids[u.id].created_at.isoformat() + "Z" if u.id in ids and ids[u.id].created_at else None,
                "digital_id_issued_at": digital_ids[u.id].issued_at.isoformat() + "Z" if u.id in digital_ids and digital_ids[u.id].issued_at else None,
                "account_created_at": u.created_at.isoformat() + "Z" if u.created_at else None,
                "trips": trips.get(u.id, []),
            } if current_user["role"] == "control_room" else {}),
        }
        for u in rows
    ]


@router.get("/tourists/{tourist_id}/track")
def get_tourist_track(
    tourist_id: str,
    current_user: dict = Depends(require_role("rescue_team", "control_room")),
    db: Session = Depends(get_db),
):
    tourist = db.query(User).filter(User.id == tourist_id, User.role == "tourist").first()
    if not tourist:
        raise HTTPException(404, "Tourist not found.")
    cutoff = datetime.utcnow() - timedelta(hours=12)
    points = (
        db.query(TouristLocation)
        .filter(TouristLocation.tourist_id == tourist_id, TouristLocation.recorded_at >= cutoff)
        .order_by(TouristLocation.recorded_at.desc())
        .limit(2000)
        .all()
    )
    return [
        {
            "lat": point.lat,
            "lng": point.lng,
            "accuracy_m": point.accuracy_m,
            "speed_kmh": point.speed_kmh,
            "recorded_at": point.recorded_at.isoformat() + "Z",
        }
        for point in reversed(points)
    ]


@router.post("/location")
def update_tourist_location(
    body: TouristLocationRequest,
    current_user: dict = Depends(require_role("tourist")),
    db: Session = Depends(get_db),
):
    if not -90 <= body.lat <= 90 or not -180 <= body.lng <= 180:
        raise HTTPException(422, "GPS coordinates are outside valid latitude/longitude ranges.")
    if body.accuracy_m is not None and not 0 <= body.accuracy_m <= 10000:
        raise HTTPException(422, "GPS accuracy must be between 0 and 10,000 meters.")
    if body.speed_kmh is not None and not 0 <= body.speed_kmh <= 100:
        raise HTTPException(422, "GPS speed is outside the accepted range.")

    tourist = db.query(User).filter(User.id == current_user["sub"], User.role == "tourist").first()
    if not tourist:
        raise HTTPException(404, "Tourist account not found.")
    now_utc = datetime.utcnow()
    tourist.last_lat = body.lat
    tourist.last_lng = body.lng
    tourist.location_accuracy_m = body.accuracy_m
    tourist.location_speed_kmh = body.speed_kmh
    tourist.location_updated_at = now_utc
    previous_point = (
        db.query(TouristLocation)
        .filter(TouristLocation.tourist_id == tourist.id)
        .order_by(TouristLocation.recorded_at.desc())
        .first()
    )
    point_recorded = previous_point is None or _distance_m(
        previous_point.lat, previous_point.lng, body.lat, body.lng
    ) >= 1
    if point_recorded:
        db.add(TouristLocation(
            tourist_id=tourist.id,
            lat=body.lat,
            lng=body.lng,
            accuracy_m=body.accuracy_m,
            speed_kmh=body.speed_kmh,
            recorded_at=now_utc,
        ))
    db.commit()
    return {
        "ok": True,
        "point_recorded": point_recorded,
        "location_updated_at": tourist.location_updated_at.isoformat() + "Z",
    }


@router.post("/refresh")
def refresh_token(body: RefreshRequest):
    payload = decode_token(body.refresh_token)
    if payload.get("type") != "refresh":
        raise HTTPException(401, "Not a refresh token")
    token_data = {"sub": payload["sub"], "role": payload["role"]}
    return {
        "access_token": create_access_token(token_data),
        "token_type": "bearer",
    }


@router.get("/me")
def get_me(current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == current_user["sub"]).first()
    if not user:
        raise HTTPException(404, "User not found")
    digital_id = db.query(DigitalTouristID).filter(DigitalTouristID.user_id == user.id).first()
    return {
        "id": user.id,
        "full_name": user.full_name,
        "phone": user.phone,
        "email": user.email,
        "role": user.role,
        "is_verified": user.is_verified,
        "dtid_code": digital_id.dtid_code if digital_id else None,
        "created_at": user.created_at.isoformat(),
    }
