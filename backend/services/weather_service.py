"""
Weather Service — VanRakshak
Fetches from OpenWeatherMap (if OWM_API_KEY set), caches for 15 min.
Falls back to a bundled mock dataset if key is absent (demo mode).
"""

from datetime import datetime, timedelta

import httpx
from config import settings

CACHE_TTL_MINUTES = 15


def _location_key(lat: float, lng: float) -> str:
    return f"lat:{round(lat, 2)}_lng:{round(lng, 2)}"


def _parse_owm_response(data: dict) -> dict:
    """Normalise OWM API response to our internal schema."""
    weather = data.get("weather", [{}])[0]
    main = data.get("main", {})
    wind = data.get("wind", {})
    rain = data.get("rain", {})
    return {
        "temperature": round(main.get("temp", 0) - 273.15, 1),  # K → °C
        "feels_like": round(main.get("feels_like", 0) - 273.15, 1),
        "humidity": main.get("humidity", 0),
        "description": weather.get("description", "").capitalize(),
        "icon": weather.get("icon", "01d"),
        "wind_speed": wind.get("speed", 0),
        "wind_dir": _deg_to_compass(wind.get("deg", 0)),
        "rain_warning": rain.get("1h", 0) > 10,   # >10mm/h = warning
        "storm_warning": "thunderstorm" in weather.get("main", "").lower(),
        "uv_index": None,  # needs separate OWM UV endpoint
        "visibility_km": round(data.get("visibility", 10000) / 1000, 1),
        "source": "openweathermap",
    }


def _deg_to_compass(deg: float) -> str:
    dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"]
    return dirs[round(deg / 22.5) % 16]


async def get_weather(lat: float, lng: float, db) -> dict:
    """
    Returns weather dict. Checks DB cache first (15 min TTL).
    Returns unavailable when OWM_API_KEY is not configured.
    """
    from sqlalchemy import select
    from models.advisory import WeatherCache
    import uuid

    key = _location_key(lat, lng)

    # Check cache
    result = await db.execute(select(WeatherCache).where(WeatherCache.location_key == key))
    cached = result.scalar_one_or_none()
    if cached:
        age = datetime.utcnow() - cached.fetched_at
        if age < timedelta(minutes=CACHE_TTL_MINUTES) and cached.payload.get("source") != "mock":
            return cached.payload

    # Fetch fresh data
    if not settings.OWM_API_KEY:
        return {"source": "unavailable", "message": "Configure OWM_API_KEY for live weather."}

    url = (
        f"https://api.openweathermap.org/data/2.5/weather"
        f"?lat={lat}&lon={lng}&appid={settings.OWM_API_KEY}"
    )
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, timeout=5)
        resp.raise_for_status()
        payload = _parse_owm_response(resp.json())

    # Update cache
    if cached:
        cached.payload = payload
        cached.fetched_at = datetime.utcnow()
    else:
        db.add(WeatherCache(id=str(uuid.uuid4()), location_key=key, payload=payload))
    await db.commit()
    return payload
