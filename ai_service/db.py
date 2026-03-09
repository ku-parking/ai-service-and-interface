import os
import psycopg2


def get_spot_coordinates(parking_spot_id: int) -> list[dict]:
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT id, x1, y1, x2, y2 FROM coor_ability WHERE parking_spot_id = %s",
            (parking_spot_id,),
        )
        rows = cur.fetchall()
        cur.close()
        return [
            {"id": r[0], "x1": r[1], "y1": r[2], "x2": r[3], "y2": r[4]}
            for r in rows
        ]
    finally:
        conn.close()
