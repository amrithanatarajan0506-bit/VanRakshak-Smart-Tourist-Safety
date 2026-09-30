"""
Identity Verification Service — NIRS-v2.4 / VanRakshak
--------------------------------------------------------
SECURITY NOTICE:
  Raw Aadhaar numbers and Passport numbers are NEVER stored.
  Flow: receive plaintext → validate format → SHA-256(value + salt) → store hash + salt only.
  The plaintext variable is explicitly deleted before this function returns.
  Visa references are Fernet-encrypted (symmetric, key in env var FERNET_KEY).
"""

import hashlib
import re
import secrets
from datetime import datetime
from typing import Literal

from cryptography.fernet import Fernet
from config import settings
from services.document_validation import validate_aadhaar_number

PASSPORT_PATTERN = re.compile(r"^(?=.*[A-Z])(?=.*\d)[A-Z0-9]{6,9}$", re.IGNORECASE)


def _get_fernet() -> Fernet:
    """Return Fernet cipher using key from settings."""
    key = settings.FERNET_KEY.encode()
    # Fernet requires 32 url-safe base64 bytes — pad/derive if needed for dev
    if len(key) < 44:
        import base64
        key = base64.urlsafe_b64encode(key.ljust(32, b"=")[:32])
    return Fernet(key)


def _hash_value(raw: str, salt: str) -> str:
    """SHA-256(raw + salt) — produces the stored token."""
    return hashlib.sha256(f"{raw}{salt}".encode("utf-8")).hexdigest()


def verify_aadhaar(raw_number: str) -> dict:
    """
    Mock UIDAI verification.
    Returns: {id_hash, id_salt, status, verified_at}
    NEVER returns or logs the raw_number.
    Production: replace the mock_verified block with a UIDAI sandbox API call
    using the hashed token (not the raw number).
    """
    clean_number = validate_aadhaar_number(raw_number)

    salt = secrets.token_hex(32)
    id_hash = _hash_value(clean_number, salt)

    # === PLAINTEXT DISPOSAL ===
    del raw_number
    del clean_number
    # ===========================

    # Mock UIDAI check (always verified in demo mode)
    # Production: POST to https://developer.uidai.gov.in/auth/{version}/{ac}/{uid}
    mock_verified = True

    return {
        "id_hash": id_hash,
        "id_salt": salt,
        "status": "verified" if mock_verified else "failed",
        "verified_at": datetime.utcnow().isoformat(),
        "id_type": "aadhaar",
    }


def verify_passport(
    passport_number: str,
    nationality: str,
    visa_ref: str | None = None,
) -> dict:
    """
    Mock passport verification.
    Passport number is SHA-256 hashed; visa_ref is Fernet-encrypted.
    """
    if not PASSPORT_PATTERN.match(passport_number):
        raise ValueError("Invalid passport number format")

    salt = secrets.token_hex(32)
    id_hash = _hash_value(passport_number.upper(), salt)

    del passport_number  # discard plaintext

    visa_ref_encrypted = None
    if visa_ref:
        fernet = _get_fernet()
        visa_ref_encrypted = fernet.encrypt(visa_ref.encode()).decode()
        del visa_ref  # discard plaintext

    return {
        "id_hash": id_hash,
        "id_salt": salt,
        "nationality": nationality.upper()[:2],
        "visa_ref_encrypted": visa_ref_encrypted,
        "status": "verified",
        "verified_at": datetime.utcnow().isoformat(),
        "id_type": "passport",
    }
