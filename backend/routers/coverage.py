"""Coverage router — sync SQLAlchemy."""
from typing import Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models.network_coverage import CoveragePoint
from services.spatial_backend import coverage_strength_at
from middleware.rbac import get_current_user

router = APIRouter(prefix="/coverage", tags=["coverage"])


class RouteRequest(BaseModel):
    route: dict
    sample_interval_m: float = 500


@router.get("/heatmap")
def get_heatmap(current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    points = db.query(CoveragePoint).all()
    return [[p.lat, p.lng, p.strength] for p in points]


@router.post("/route")
def coverage_along_route(body: RouteRequest, current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    all_points = db.query(CoveragePoint).all()
    coords = body.route.get("coordinates", [])
    samples = [{"lat": lat, "lng": lng, "strength": round(coverage_strength_at(lat, lng, all_points), 3)}
               for lng, lat in coords]
    avg = sum(s["strength"] for s in samples) / len(samples) if samples else 0
    min_str = min((s["strength"] for s in samples), default=0)
    return {"samples": samples, "average_strength": round(avg, 3), "min_strength": round(min_str, 3),
            "coverage_label": "Strong" if avg > 0.7 else "Moderate" if avg > 0.4 else "Weak"}
