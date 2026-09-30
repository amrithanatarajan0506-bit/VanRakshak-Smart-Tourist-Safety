import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, Float, JSON, ForeignKey
from sqlalchemy.orm import relationship
from database import Base


def gen_uuid():
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=gen_uuid)
    full_name = Column(String, nullable=True)          # name entered at registration
    phone = Column(String, unique=True, nullable=True)
    email = Column(String, unique=True, nullable=True)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False, default="tourist")
    is_verified = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_login_at = Column(DateTime, nullable=True)     # last time this person entered the app
    last_lat = Column(Float, nullable=True)
    last_lng = Column(Float, nullable=True)
    location_accuracy_m = Column(Float, nullable=True)
    location_speed_kmh = Column(Float, nullable=True)
    location_updated_at = Column(DateTime, nullable=True)

    identity = relationship("IdentityRecord", back_populates="user", uselist=False,
                            foreign_keys="[IdentityRecord.user_id]")
    digital_id = relationship("DigitalTouristID", back_populates="user", uselist=False,
                              foreign_keys="[DigitalTouristID.user_id]")
    trips = relationship("Trip", back_populates="user", foreign_keys="[Trip.user_id]")


class IdentityRecord(Base):
    """
    SECURITY: Raw Aadhaar / Passport numbers are NEVER stored.
    Only SHA-256(raw + salt) hash is persisted.
    """
    __tablename__ = "identity_records"

    id = Column(String, primary_key=True, default=gen_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    id_type = Column(String, nullable=False)           # aadhaar | passport
    id_hash = Column(String, nullable=False)
    id_salt = Column(String, nullable=False)
    nationality = Column(String, nullable=True)
    passport_country = Column(String, nullable=True)
    visa_ref_encrypted = Column(String, nullable=True)
    verification_status = Column(String, default="pending")
    document_path = Column(String, nullable=True)      # uploaded Aadhaar / passport soft copy (file name only)
    verified_at = Column(DateTime, nullable=True)
    audit_accessed_by = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="identity", foreign_keys=[user_id])


class DigitalTouristID(Base):
    """SHA-256 hash-chain ledger record. One per verified user."""
    __tablename__ = "digital_tourist_ids"

    id = Column(String, primary_key=True, default=gen_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    dtid_code = Column(String, unique=True, nullable=False)
    chain_hash = Column(String, nullable=False)
    prev_hash = Column(String, nullable=True)
    issued_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="digital_id", foreign_keys=[user_id])


class IdentityAuditLog(Base):
    __tablename__ = "identity_audit_log"

    id = Column(String, primary_key=True, default=gen_uuid)
    accessor_id = Column(String, ForeignKey("users.id"), nullable=False)
    target_record_id = Column(String, ForeignKey("identity_records.id"), nullable=False)
    action = Column(String, nullable=False)
    ip_address = Column(String, nullable=True)
    accessed_at = Column(DateTime, default=datetime.utcnow)
