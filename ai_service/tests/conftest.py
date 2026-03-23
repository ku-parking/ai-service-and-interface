import pathlib
import os
import sys


PROJECT_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


def pytest_configure() -> None:
    os.environ.setdefault("allow_origins", '["http://localhost:3000"]')
    os.environ.setdefault("allow_methods", '["*"]')
    os.environ.setdefault("allow_headers", '["*"]')
    os.environ.setdefault("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/postgres")
    os.environ.setdefault("REDIS_URL", "redis://localhost:6379")
    os.environ.setdefault("REDIS_OCCUPANCY_TTL_SECONDS", "60")
    os.environ.setdefault("CACHE_TTL_SECONDS", "300")
    os.environ.setdefault("IOU_THRESHOLD", "0.3")
