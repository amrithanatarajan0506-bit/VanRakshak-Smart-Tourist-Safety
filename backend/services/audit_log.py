"""Audit log service — sync SQLAlchemy."""
import uuid
from datetime import datetime
from models.user import IdentityAuditLog


def log_identity_access(db, accessor_id: str, target_record_id: str, action: str, ip_address=None):
    entry = IdentityAuditLog(
        id=str(uuid.uuid4()),
        accessor_id=accessor_id,
        target_record_id=target_record_id,
        action=action,
        ip_address=ip_address,
        accessed_at=datetime.utcnow(),
    )
    db.add(entry)
    db.commit()
