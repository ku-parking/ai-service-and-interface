from pydantic import BaseModel

class BoundingBox(BaseModel):
    x1: float
    y1: float
    x2: float
    y2: float

class SpotDefinition(BaseModel):
    id: str
    box: BoundingBox
    confidence: float | None = None

class SaveSpotsRequest(BaseModel):
    spots: list[SpotDefinition]