from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base
from models.tourist_location import TouristLocation
from models.user import User
from routers.auth import TouristLocationRequest, get_tourist_track, update_tourist_location


def test_tourist_track_records_one_meter_movement_and_ignores_smaller_jitter():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    session_factory = sessionmaker(bind=engine)
    db = session_factory()
    tourist_id = "tracking-test-tourist"
    db.add(User(id=tourist_id, role="tourist", password_hash="test"))
    db.commit()

    first = update_tourist_location(
        TouristLocationRequest(lat=12, lng=77, accuracy_m=3),
        {"sub": tourist_id},
        db,
    )
    jitter = update_tourist_location(
        TouristLocationRequest(lat=12 + 0.5 / 111_195, lng=77, accuracy_m=3),
        {"sub": tourist_id},
        db,
    )
    moved = update_tourist_location(
        TouristLocationRequest(lat=12 + 1.2 / 111_195, lng=77, accuracy_m=3),
        {"sub": tourist_id},
        db,
    )
    track = get_tourist_track(tourist_id, {"role": "control_room"}, db)

    assert first["point_recorded"] is True
    assert jitter["point_recorded"] is False
    assert moved["point_recorded"] is True
    assert len(db.query(TouristLocation).filter_by(tourist_id=tourist_id).all()) == 2
    assert len(track) == 2
    assert track[0]["lat"] < track[1]["lat"]

    db.close()
    Base.metadata.drop_all(bind=engine)
    engine.dispose()