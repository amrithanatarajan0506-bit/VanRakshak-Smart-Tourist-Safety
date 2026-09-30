"""Advisories router — sync SQLAlchemy."""
import uuid
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models.advisory import Advisory
from middleware.rbac import require_role

router = APIRouter(prefix="/advisories", tags=["advisories"])


class AdvisoryCreate(BaseModel):
    title: str; body: str
    category: Optional[str] = None; region: Optional[str] = None
    severity: str = "info"; expires_at: Optional[str] = None


@router.get("")
def list_advisories(region: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(Advisory).filter(
                           Advisory.created_by.isnot(None),
                           (Advisory.expires_at == None) | (Advisory.expires_at > datetime.utcnow()))\
                           .order_by(Advisory.published_at.desc())
    if region: q = q.filter(Advisory.region == region)
    return [{"id": a.id, "title": a.title, "body": a.body, "category": a.category,
             "region": a.region, "severity": a.severity, "published_at": a.published_at.isoformat()}
            for a in q.all()]


@router.post("", status_code=201)
def create_advisory(body: AdvisoryCreate, current_user: dict = Depends(require_role("control_room")), db: Session = Depends(get_db)):
    adv = Advisory(id=str(uuid.uuid4()), title=body.title, body=body.body, category=body.category,
                   region=body.region, severity=body.severity, created_by=current_user["sub"],
                   expires_at=datetime.fromisoformat(body.expires_at) if body.expires_at else None)
    db.add(adv); db.commit()
    return {"id": adv.id, "title": adv.title}
