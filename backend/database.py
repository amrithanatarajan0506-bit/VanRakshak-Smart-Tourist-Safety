"""
Database — Synchronous SQLAlchemy with SQLite
Using sync engine (no aiosqlite/greenlet) for Python 3.14 compatibility.
FastAPI endpoints use run_in_executor pattern for non-blocking I/O.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase, Session
from config import settings
import threading

# Normalize database URL for SQLAlchemy 2.0 sync engine
raw_url = settings.DATABASE_URL.replace("sqlite+aiosqlite", "sqlite")
if raw_url.startswith("postgres://"):
    raw_url = raw_url.replace("postgres://", "postgresql://", 1)

is_sqlite = raw_url.startswith("sqlite")
engine_kwargs = {"echo": (settings.APP_ENV == "development")}
if is_sqlite:
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    engine_kwargs["pool_pre_ping"] = True

engine = create_engine(raw_url, **engine_kwargs)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI dependency — yields a synchronous DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all tables. Call on startup."""
    from models import user, trip, tourist_location, incident, geofence, ranger, network_coverage, advisory  # noqa: F401
    Base.metadata.create_all(bind=engine)
    try:
        _migrate_users_full_name()
    except Exception:
        pass
    try:
        _migrate_users_last_login()
    except Exception:
        pass
    try:
        _migrate_users_location()
    except Exception:
        pass
    try:
        _migrate_identity_document()
    except Exception:
        pass


def _migrate_users_full_name():
    """Add users.full_name to databases created before registration captured a name."""
    from sqlalchemy import inspect, text
    insp = inspect(engine)
    if "users" not in insp.get_table_names():
        return
    cols = [c["name"] for c in insp.get_columns("users")]
    if "full_name" not in cols:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN full_name VARCHAR"))


def _migrate_users_last_login():
    """Add users.last_login_at to databases created before it existed."""
    from sqlalchemy import inspect, text
    insp = inspect(engine)
    if "users" not in insp.get_table_names():
        return
    cols = [c["name"] for c in insp.get_columns("users")]
    if "last_login_at" not in cols:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN last_login_at DATETIME"))


def _migrate_users_location():
    """Add the latest tourist GPS fields to existing user tables."""
    from sqlalchemy import inspect, text
    insp = inspect(engine)
    if "users" not in insp.get_table_names():
        return
    columns = {column["name"] for column in insp.get_columns("users")}
    additions = {
        "last_lat": "FLOAT",
        "last_lng": "FLOAT",
        "location_accuracy_m": "FLOAT",
        "location_speed_kmh": "FLOAT",
        "location_updated_at": "DATETIME",
    }
    with engine.begin() as connection:
        for name, column_type in additions.items():
            if name not in columns:
                connection.execute(text(f"ALTER TABLE users ADD COLUMN {name} {column_type}"))


def _migrate_identity_document():
    """Add identity_records.document_path to databases created before uploads existed."""
    from sqlalchemy import inspect, text
    insp = inspect(engine)
    if "identity_records" not in insp.get_table_names():
        return
    cols = [c["name"] for c in insp.get_columns("identity_records")]
    if "document_path" not in cols:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE identity_records ADD COLUMN document_path VARCHAR"))
