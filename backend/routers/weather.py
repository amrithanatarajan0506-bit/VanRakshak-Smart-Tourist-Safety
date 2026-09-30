"""Weather router — sync wrapper."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import httpx, uuid
from datetime import datetime, timedelta
from config import settings

router = APIRouter(prefix="/weather", tags=["weather"])

CACHE_TTL_MINUTES = 15

def _location_key(lat, lng): return f"lat:{round(lat,2)}_lng:{round(lng,2)}"
def _deg_to_compass(deg):
    dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"]
    return dirs[round(deg/22.5)%16]


DEFAULT_REGIONAL_WEATHER = [
    {
        "city": "Kasauli Ridge",
        "location": "Kasauli, HP",
        "temp": 16.5,
        "temperature": 16.5,
        "condition": "Partly Cloudy",
        "description": "Partly Cloudy",
        "humidity": 68,
        "wind_speed": 4.2,
        "rain_warning": False,
        "storm_warning": False,
        "source": "simulated_station",
    },
    {
        "city": "Dzukou Valley",
        "location": "Dzukou Valley, Nagaland",
        "temp": 12.0,
        "temperature": 12.0,
        "condition": "Mist & Rain Alert",
        "description": "Light Rain / Sub-surface Bog Hazard",
        "humidity": 89,
        "wind_speed": 5.8,
        "rain_warning": True,
        "storm_warning": False,
        "source": "simulated_station",
    },
    {
        "city": "Goechala Pass",
        "location": "Goechala, Sikkim",
        "temp": -2.4,
        "temperature": -2.4,
        "condition": "Freezing Fog / Crevasse Caution",
        "description": "Sub-zero Glacial Hazard",
        "humidity": 78,
        "wind_speed": 12.5,
        "rain_warning": False,
        "storm_warning": True,
        "source": "simulated_station",
    },
    {
        "city": "Ooty Peak",
        "location": "Nilgiris, Tamil Nadu",
        "temp": 18.2,
        "temperature": 18.2,
        "condition": "Clear Sky",
        "description": "Gentle Breeze",
        "humidity": 55,
        "wind_speed": 3.1,
        "rain_warning": False,
        "storm_warning": False,
        "source": "simulated_station",
    },
    {
        "city": "Cherrapunji Basin",
        "location": "East Khasi Hills, Meghalaya",
        "temp": 19.5,
        "temperature": 19.5,
        "condition": "Heavy Rain / Flood Chasm Alert",
        "description": "Active Karst Flooding",
        "humidity": 95,
        "wind_speed": 7.4,
        "rain_warning": True,
        "storm_warning": True,
        "source": "simulated_station",
    },
]


@router.get("")
def list_weather():
    """Returns regional weather summary for surveyed trails & hazard sectors."""
    return DEFAULT_REGIONAL_WEATHER


@router.get("/{lat}/{lng}")
def fetch_weather(lat: float, lng: float, db: Session = Depends(get_db)):
    from models.advisory import WeatherCache
    key = _location_key(lat, lng)
    cached = db.query(WeatherCache).filter(WeatherCache.location_key == key).first()
    if cached and cached.payload.get("source") != "mock" and (datetime.utcnow() - cached.fetched_at) < timedelta(minutes=CACHE_TTL_MINUTES):
        return cached.payload

    if not settings.OWM_API_KEY:
        base_temp = round(26.0 - (abs(lat) * 0.35), 1)
        return {
            "temperature": base_temp,
            "feels_like": base_temp - 1.0,
            "humidity": 65,
            "description": "Mountain safety telemetry active",
            "icon": "01d",
            "wind_speed": 3.5,
            "wind_dir": "NE",
            "rain_warning": False,
            "storm_warning": False,
            "uv_index": 5,
            "visibility_km": 10.0,
            "source": "demo_telemetry",
        }

    url = f"https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lng}&appid={settings.OWM_API_KEY}"
    resp = httpx.get(url, timeout=5); resp.raise_for_status()
    d = resp.json(); main = d.get("main",{}); wind = d.get("wind",{})
    w = d.get("weather",[{}])[0]; rain = d.get("rain",{})
    payload = {
        "temperature": round(main.get("temp",0)-273.15,1), "feels_like": round(main.get("feels_like",0)-273.15,1),
        "humidity": main.get("humidity",0), "description": w.get("description","").capitalize(),
        "icon": w.get("icon","01d"), "wind_speed": wind.get("speed",0),
        "wind_dir": _deg_to_compass(wind.get("deg",0)),
        "rain_warning": rain.get("1h",0)>10, "storm_warning": "thunderstorm" in w.get("main","").lower(),
        "uv_index": None, "visibility_km": round(d.get("visibility",10000)/1000,1), "source": "openweathermap",
    }

    if cached:
        cached.payload = payload; cached.fetched_at = datetime.utcnow()
    else:
        db.add(WeatherCache(id=str(uuid.uuid4()), location_key=key, payload=payload))
    db.commit()
    return payload
