import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Float, Boolean, Text
from database import Base


def gen_uuid():
    return str(uuid.uuid4())


class DangerZone(Base):
    """
    Pre-flagged hazard zones with 500m default radius.
    Used for: tourist danger alerts, Control Room map overlay,
    route intersection checks (Haversine / PostGIS ST_DWithin).
    """
    __tablename__ = "danger_zones"

    id = Column(String, primary_key=True, default=gen_uuid)
    name = Column(String, nullable=False)
    zone_type = Column(String, nullable=False)
    # landslide | flood | wildfire | wildlife | restricted
    center_lat = Column(Float, nullable=False)
    center_lng = Column(Float, nullable=False)
    radius_m = Column(Float, default=500.0)
    severity = Column(String, default="medium")   # low | medium | high | critical
    description = Column(Text, nullable=True)
    active = Column(Boolean, default=True)
    created_by = Column(String, nullable=True)    # user_id of control_room operator
    created_at = Column(DateTime, default=datetime.utcnow)
