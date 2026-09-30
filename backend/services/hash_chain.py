"""
SHA-256 Hash-Chain Service — VanRakshak / NIRS-v2.4
-----------------------------------------------------
Blockchain-inspired (honestly labelled): single-node, append-only chain.
Each Digital Tourist ID links to the previous record's hash.
The chain can be verified by re-computing hashes from genesis.
This is NOT a distributed ledger — it is a tamper-evident local ledger.
"""

import hashlib
import uuid
from datetime import datetime


GENESIS_SENTINEL = "VANRAKSHAK_GENESIS_0000"


def mint_digital_tourist_id(user_id: str, prev_hash: str | None) -> dict:
    """
    Create a new Digital Tourist ID record for the hash chain.

    Args:
        user_id: UUID string of the verified user
        prev_hash: SHA-256 hash of the previous chain record (None = genesis)

    Returns:
        dict with dtid_code, chain_hash, prev_hash, issued_at
    """
    issued_at = datetime.utcnow()
    ts_iso = issued_at.isoformat()
    suffix = uuid.uuid4().hex[:6].upper()
    date_str = issued_at.strftime("%Y%m%d")
    dtid_code = f"VR-{date_str}-{suffix}"

    chain_input = f"{prev_hash or GENESIS_SENTINEL}{dtid_code}{user_id}{ts_iso}"
    chain_hash = hashlib.sha256(chain_input.encode("utf-8")).hexdigest()

    return {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "dtid_code": dtid_code,
        "chain_hash": chain_hash,
        "prev_hash": prev_hash,
        "issued_at": issued_at,
    }


def verify_chain(records: list[dict]) -> bool:
    """
    Verify integrity of the hash chain.

    Args:
        records: list of dicts with {dtid_code, user_id, chain_hash, prev_hash, issued_at}
                 ordered oldest → newest.

    Returns:
        True if chain is intact, False if tampering detected.
    """
    if not records:
        return True

    for i, record in enumerate(records):
        expected_prev = records[i - 1]["chain_hash"] if i > 0 else None
        ts_iso = record["issued_at"].isoformat() if hasattr(record["issued_at"], "isoformat") else record["issued_at"]
        chain_input = f"{expected_prev or GENESIS_SENTINEL}{record['dtid_code']}{record['user_id']}{ts_iso}"
        expected_hash = hashlib.sha256(chain_input.encode("utf-8")).hexdigest()
        if expected_hash != record["chain_hash"]:
            return False
    return True
