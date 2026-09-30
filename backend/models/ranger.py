"""Ranger + RangerLocation models — sync SQLAlchemy."""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Float, DateTime, ForeignKey
from database import Base


def gen_uuid():
    return str(uuid.uuid4())


class Ranger(Base):
    __tablename__ = "rangers"

    id = Column(String, primary_key=True, default=gen_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
    dtid_id = Column(String, nullable=True)
    unit_id = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    unit_type = Column(String, default="ranger")  # ranger | medic | police | evac_heli
    status = Column(String, default="available")   # available | dispatched | on_site | off_duty



class RangerLocation(Base):
    __tablename__ = "ranger_locations"

    id = Column(String, primary_key=True, default=gen_uuid)
    ranger_id = Column(String, ForeignKey("rangers.id"), nullable=False)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    accuracy_m = Column(Float, nullable=True)
    recorded_at = Column(DateTime, default=datetime.utcnow)
