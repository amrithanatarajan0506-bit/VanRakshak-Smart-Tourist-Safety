from sqlalchemy import Column, String, Float, Integer
from database import Base


class CoveragePoint(Base):
    """
    Network coverage data points for heatmap layer.
    strength: 0.0 (no signal) → 1.0 (full signal)
    Source: seed (static) | crowdsourced | telco
    """
    __tablename__ = "coverage_points"

    id = Column(Integer, primary_key=True, autoincrement=True)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    strength = Column(Float, nullable=False)   # 0.0 → 1.0
    source = Column(String, default="seed")    # seed | crowdsourced | telco
