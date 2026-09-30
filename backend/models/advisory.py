"""Advisory + WeatherCache models."""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, JSON, Text
from database import Base


def gen_uuid():
    return str(uuid.uuid4())


class Advisory(Base):
    __tablename__ = "advisories"

    id = Column(String, primary_key=True, default=gen_uuid)
    title = Column(String, nullable=False)
    body = Column(Text, nullable=False)
    category = Column(String, nullable=True)
    region = Column(String, nullable=True)
    severity = Column(String, default="info")
    expires_at = Column(DateTime, nullable=True)
    published_at = Column(DateTime, default=datetime.utcnow)
    created_by = Column(String, nullable=True)


class WeatherCache(Base):
    __tablename__ = "weather_cache"

    id = Column(String, primary_key=True, default=gen_uuid)
    location_key = Column(String, nullable=False, unique=True)
    payload = Column(JSON, nullable=False, default=dict)
    fetched_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
