"""Identity router — sync SQLAlchemy."""
import uuid
from datetime import datetime
from typing import Optional

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models.user import IdentityRecord, DigitalTouristID, User
from services.document_validation import DocumentError
from services.identity_service import verify_aadhaar, verify_passport
from services.hash_chain import mint_digital_tourist_id
from services.audit_log import log_identity_access
from middleware.rbac import get_current_user, require_role

router = APIRouter(prefix="/identity", tags=["identity"])


class AadhaarRequest(BaseModel):
    aadhaar_number: str


class PassportRequest(BaseModel):
    passport_number: str
    nationality: str
    visa_ref: Optional[str] = None


@router.post("/aadhaar")
def submit_aadhaar(
    body: AadhaarRequest,
    current_user: dict = Depends(require_role("tourist")),
    db: Session = Depends(get_db),
):
    user_id = current_user["sub"]
    existing = db.query(IdentityRecord).filter(IdentityRecord.user_id == user_id).first()
    if existing and existing.verification_status == "verified":
        raise HTTPException(409, "Identity already verified")

    try:
        result = verify_aadhaar(body.aadhaar_number)
    except DocumentError as exc:
        raise HTTPException(422, str(exc)) from exc

    record = IdentityRecord(
        id=str(uuid.uuid4()),
        user_id=user_id,
        id_type="aadhaar",
        id_hash=result["id_hash"],
        id_salt=result["id_salt"],
        nationality="IN",
        verification_status=result["status"],
        verified_at=datetime.fromisoformat(result["verified_at"]) if result["status"] == "verified" else None,
    )
    db.add(record)

    dtid_data = _mint_dtid(user_id, db)
    user = db.query(User).filter(User.id == user_id).first()
    user.is_verified = True
    db.commit()

    return {
        "verification_status": result["status"],
        "dtid_code": dtid_data["dtid_code"],
        "chain_hash": dtid_data["chain_hash"],
        "id_type": "aadhaar",
    }


@router.post("/passport")
def submit_passport(
    body: PassportRequest,
    current_user: dict = Depends(require_role("tourist")),
    db: Session = Depends(get_db),
):
    user_id = current_user["sub"]
    existing = db.query(IdentityRecord).filter(IdentityRecord.user_id == user_id).first()
    if existing and existing.verification_status == "verified":
        raise HTTPException(409, "Identity already verified")

    result = verify_passport(body.passport_number, body.nationality, body.visa_ref)

    record = IdentityRecord(
        id=str(uuid.uuid4()),
        user_id=user_id,
        id_type="passport",
        id_hash=result["id_hash"],
        id_salt=result["id_salt"],
        nationality=result["nationality"],
        visa_ref_encrypted=result.get("visa_ref_encrypted"),
        verification_status=result["status"],
        verified_at=datetime.fromisoformat(result["verified_at"]),
    )
    db.add(record)
    dtid_data = _mint_dtid(user_id, db)
    user = db.query(User).filter(User.id == user_id).first()
    user.is_verified = True
    db.commit()

    return {
        "verification_status": result["status"],
        "dtid_code": dtid_data["dtid_code"],
        "chain_hash": dtid_data["chain_hash"],
        "id_type": "passport",
        "nationality": result["nationality"],
    }


@router.get("/status")
def get_verification_status(
    current_user: dict = Depends(require_role("tourist")),
    db: Session = Depends(get_db),
):
    record = db.query(IdentityRecord).filter(IdentityRecord.user_id == current_user["sub"]).first()
    return {
        "verification_status": record.verification_status if record else "not_submitted",
        "id_type": record.id_type if record else None,
    }


@router.get("/dtid")
def get_dtid(
    current_user: dict = Depends(require_role("tourist")),
    db: Session = Depends(get_db),
):
    dtid = db.query(DigitalTouristID).filter(DigitalTouristID.user_id == current_user["sub"]).first()
    if not dtid:
        raise HTTPException(404, "Digital Tourist ID not yet issued — complete identity verification first")
    return {
        "dtid_code": dtid.dtid_code,
        "chain_hash": dtid.chain_hash,
        "prev_hash": dtid.prev_hash,
        "issued_at": dtid.issued_at.isoformat(),
    }


@router.get("/{user_id}")
def get_identity_by_user(
    user_id: str,
    request: Request,
    current_user: dict = Depends(require_role("control_room", "rescue_team")),
    db: Session = Depends(get_db),
):
    record = db.query(IdentityRecord).filter(IdentityRecord.user_id == user_id).first()
    if not record:
        raise HTTPException(404, "No identity record for this user")

    log_identity_access(
        db,
        accessor_id=current_user["sub"],
        target_record_id=record.id,
        action="view",
        ip_address=request.client.host if request.client else None,
    )

    return {
        "id_type": record.id_type,
        "nationality": record.nationality,
        "verification_status": record.verification_status,
        "verified_at": record.verified_at.isoformat() if record.verified_at else None,
    }


@router.get("/{user_id}/document")
def get_identity_document(
    user_id: str,
    request: Request,
    current_user: dict = Depends(require_role("control_room", "rescue_team")),
    db: Session = Depends(get_db),
):
    """Uploaded Aadhaar card / passport soft copy — Ranger and Admin only, every view is audit-logged."""
    from routers.auth import UPLOAD_DIR
    record = db.query(IdentityRecord).filter(IdentityRecord.user_id == user_id).first()
    if not record or not record.document_path:
        raise HTTPException(404, "No document uploaded for this tourist")
    path = UPLOAD_DIR / Path(record.document_path).name
    if not path.is_file():
        raise HTTPException(404, "Document file is missing")

    log_identity_access(
        db,
        accessor_id=current_user["sub"],
        target_record_id=record.id,
        action="view_document",
        ip_address=request.client.host if request.client else None,
    )
    return FileResponse(path)


def _mint_dtid(user_id: str, db: Session) -> dict:
    prev = db.query(DigitalTouristID).filter(DigitalTouristID.user_id == user_id).first()
    prev_hash = prev.chain_hash if prev else None
    dtid_data = mint_digital_tourist_id(user_id, prev_hash)
    dtid = DigitalTouristID(**dtid_data)
    db.add(dtid)
    return dtid_data
