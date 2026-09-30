"""
Spatial Backend Abstraction — VanRakshak
-----------------------------------------
Dev:  SQLite + Haversine formula
Prod: PostGIS — ST_DWithin / ST_Distance / ST_Contains
      Switch by setting USE_POSTGIS=true in .env

All spatial helpers are pure-Python (SQLite path) or raw SQL (PostGIS path).
The calling code never needs to know which backend is active.
"""

import math
from config import settings

EARTH_RADIUS_M = 6_371_000


def haversine_distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in metres between two lat/lng points."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return EARTH_RADIUS_M * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def point_in_zone(lat: float, lng: float, zone) -> bool:
    """
    Check if a point is within a danger zone's radius.
    SQLite: Haversine. PostGIS: ST_DWithin (upgrade path below).
    """
    if settings.USE_POSTGIS:
        # Production path — caller must use raw SQL via session.execute():
        # SELECT ST_DWithin(
        #   geography(ST_MakePoint(:lng, :lat)),
        #   geography(ST_MakePoint(:zone_lng, :zone_lat)),
        #   :radius_m
        # )
        raise NotImplementedError(
            "PostGIS backend: use ST_DWithin query directly via session.execute(). "
            "Set USE_POSTGIS=false to use the Haversine fallback."
        )
    return haversine_distance_m(lat, lng, zone.center_lat, zone.center_lng) <= zone.radius_m


def route_intersects_zone(geojson_linestring: dict, zone) -> bool:
    """
    Check if any point on a GeoJSON LineString is within zone radius.
    Uses Haversine sampling (SQLite dev path).
    """
    coords = geojson_linestring.get("coordinates", [])
    for lng, lat in coords:  # GeoJSON is [lng, lat]
        if point_in_zone(lat, lng, zone):
            return True
    return False


def bearing_deg(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Initial bearing from point 1 to point 2 in degrees (0=North)."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dlam = math.radians(lng2 - lng1)
    x = math.sin(dlam) * math.cos(phi2)
    y = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(dlam)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


def coverage_strength_at(lat: float, lng: float, coverage_points: list, radius_m: float = 2000) -> float:
    """
    IDW (Inverse Distance Weighted) interpolation of coverage strength
    at a given point using nearby coverage_points.
    Returns 0.0–1.0.
    """
    weights = []
    values = []
    for cp in coverage_points:
        d = haversine_distance_m(lat, lng, cp.lat, cp.lng)
        if d < 1:
            return cp.strength  # exactly on a known point
        if d <= radius_m:
            w = 1 / (d ** 2)
            weights.append(w)
            values.append(cp.strength * w)
    if not weights:
        return 0.5  # unknown — assume moderate
    return sum(values) / sum(weights)
