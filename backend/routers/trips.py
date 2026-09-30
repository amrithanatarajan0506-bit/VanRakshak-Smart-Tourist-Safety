"""Trips router — sync SQLAlchemy."""
import uuid, base64
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models.trip import Trip
from middleware.rbac import require_role

router = APIRouter(prefix="/trips", tags=["trips"])


class TripCreate(BaseModel):
    destination: str
    planned_route: Optional[dict] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None


class TripUpdate(BaseModel):
    status: Optional[str] = None
    destination: Optional[str] = None


@router.post("", status_code=201)
def create_trip(body: TripCreate, current_user: dict = Depends(require_role("tourist")), db: Session = Depends(get_db)):
    from cryptography.fernet import Fernet
    from config import settings
    enc_phone = None
    if body.emergency_contact_phone:
        key = settings.FERNET_KEY.encode()
        if len(key) < 44:
            key = base64.urlsafe_b64encode(key.ljust(32, b"=")[:32])
        enc_phone = Fernet(key).encrypt(body.emergency_contact_phone.encode()).decode()

    trip = Trip(
        id=str(uuid.uuid4()),
        user_id=current_user["sub"],
        destination=body.destination,
        planned_route=body.planned_route,
        start_date=datetime.strptime(body.start_date, "%Y-%m-%d").date() if body.start_date else None,
        end_date=datetime.strptime(body.end_date, "%Y-%m-%d").date() if body.end_date else None,
        emergency_contact_name=body.emergency_contact_name,
        emergency_contact_phone_encrypted=enc_phone,
    )
    db.add(trip); db.commit(); db.refresh(trip)
    return {"id": trip.id, "destination": trip.destination, "status": trip.status}


@router.get("")
def list_trips(current_user: dict = Depends(require_role("tourist")), db: Session = Depends(get_db)):
    trips = db.query(Trip).filter(Trip.user_id == current_user["sub"]).all()
    return [{"id": t.id, "destination": t.destination, "status": t.status,
             "start_date": str(t.start_date), "end_date": str(t.end_date)} for t in trips]


@router.get("/{trip_id}")
def get_trip(trip_id: str, current_user: dict = Depends(require_role("tourist")), db: Session = Depends(get_db)):
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip or (trip.user_id != current_user["sub"] and current_user["role"] != "control_room"):
        raise HTTPException(404, "Trip not found")
    return {"id": trip.id, "destination": trip.destination, "planned_route": trip.planned_route,
            "start_date": str(trip.start_date), "end_date": str(trip.end_date),
            "emergency_contact_name": trip.emergency_contact_name, "status": trip.status}


@router.patch("/{trip_id}")
def update_trip(trip_id: str, body: TripUpdate, current_user: dict = Depends(require_role("tourist")), db: Session = Depends(get_db)):
    trip = db.query(Trip).filter(Trip.id == trip_id, Trip.user_id == current_user["sub"]).first()
    if not trip: raise HTTPException(404, "Trip not found")
    if body.status: trip.status = body.status
    if body.destination: trip.destination = body.destination
    db.commit()
    return {"id": trip.id, "status": trip.status}
