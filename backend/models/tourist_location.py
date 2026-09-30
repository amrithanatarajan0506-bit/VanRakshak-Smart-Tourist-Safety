import uuid
from datetime import datetime
from sqlalchemy import Column, DateTime, Float, ForeignKey, String
from database import Base


class TouristLocation(Base):
    __tablename__ = "tourist_locations"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tourist_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    accuracy_m = Column(Float, nullable=True)
    speed_kmh = Column(Float, nullable=True)
    recorded_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)