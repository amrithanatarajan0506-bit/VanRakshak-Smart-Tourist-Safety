import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Float, Boolean, Text, JSON
from database import Base


def gen_uuid():
    return str(uuid.uuid4())


class Incident(Base):
    """Core incident record — existing model, retained from NIRS-v2.4."""
    __tablename__ = "incidents"

    id = Column(String, primary_key=True, default=gen_uuid)
    tourist_id = Column(String, nullable=True)          # FK to users
    dtid_code = Column(String, nullable=True)           # Digital Tourist ID code
    incident_type = Column(String, nullable=False)      # fall | sos | medical | wildlife | other
    severity = Column(String, default="medium")         # low | medium | high | critical
    status = Column(String, default="DETECTED")
    # DETECTED → TEAM_ASSIGNED → TEAM_ON_SITE → RESOLVED
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
    gnss_accuracy_m = Column(Float, nullable=True)
    search_radius_m = Column(Float, default=100.0)
    ai_confidence = Column(Float, nullable=True)        # 0.0-1.0 model confidence
    assigned_ranger_id = Column(String, nullable=True)
    eta_minutes = Column(Float, nullable=True)
    fall_confidence = Column(Float, nullable=True)
    notes = Column(Text, nullable=True)
    timeline = Column(JSON, default=list)               # list of {event, timestamp, actor}
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)
    # Dead-reckoning fields (set when connectivity drops)
    dr_estimated_lat = Column(Float, nullable=True)
    dr_estimated_lng = Column(Float, nullable=True)
    dr_radius_m = Column(Float, nullable=True)
    dr_last_updated = Column(DateTime, nullable=True)
