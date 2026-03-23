import time
import psycopg2
from setting import get_settings

_cache: dict[int, tuple[float, list[dict]]] = {}


def clear_cache() -> None:
    _cache.clear()

def get_spot_coordinates(parking_spot_id: int) -> list[dict]:
    now = time.monotonic()
    cached = _cache.get(parking_spot_id)
    if cached is not None:
        cached_at, data = cached
        if now - cached_at < get_settings().cache_ttl_seconds:
            return data

    conn = psycopg2.connect(get_settings().database_url)
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT id, x1, y1, x2, y2 FROM coor_ability WHERE parking_spot_id = %s",
            (parking_spot_id,),
        )
        rows = cur.fetchall()
        cur.close()
        data = [
            {"id": r[0], "x1": r[1], "y1": r[2], "x2": r[3], "y2": r[4]}
            for r in rows
        ]
        _cache[parking_spot_id] = (now, data)
        return data
    finally:
        conn.close()
