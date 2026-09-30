import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Date, JSON, Text, ForeignKey
from sqlalchemy.orm import relationship
from database import Base


def gen_uuid():
    return str(uuid.uuid4())


class Trip(Base):
    __tablename__ = "trips"

    id = Column(String, primary_key=True, default=gen_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    dtid_id = Column(String, nullable=True)
    destination = Column(String, nullable=False)
    planned_route = Column(JSON, nullable=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    emergency_contact_name = Column(String, nullable=True)
    emergency_contact_phone_encrypted = Column(Text, nullable=True)
    status = Column(String, default="planned")
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="trips", foreign_keys=[user_id])
