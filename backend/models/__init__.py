# models/__init__.py — ensure all models are imported so Base.metadata is complete
from .user import User, IdentityRecord, DigitalTouristID, IdentityAuditLog
from .trip import Trip
from .tourist_location import TouristLocation
from .incident import Incident
from .geofence import DangerZone
from .ranger import Ranger, RangerLocation
from .network_coverage import CoveragePoint
from .advisory import Advisory, WeatherCache

__all__ = [
    "User", "IdentityRecord", "DigitalTouristID", "IdentityAuditLog",
    "Trip", "TouristLocation", "Incident", "DangerZone", "Ranger", "RangerLocation",
    "CoveragePoint", "Advisory", "WeatherCache",
]
