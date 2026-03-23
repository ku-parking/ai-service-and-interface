#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.yml"
MOBILE_BACKEND_DIR="${ROOT_DIR}/mobile_backend"
SKIP_MOBILE_BACKEND="${SKIP_MOBILE_BACKEND:-0}"
MOCK_DETECTION="${MOCK_DETECTION:-1}"

cleanup() {
  if [[ "${KEEP_SERVICES:-0}" == "1" ]]; then
    echo "KEEP_SERVICES=1 set, leaving compose stack running"
    return
  fi

  docker compose -f "${COMPOSE_FILE}" down --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

if [[ "${SKIP_MOBILE_BACKEND}" != "1" ]] && [[ ! -d "${MOBILE_BACKEND_DIR}" ]]; then
  echo "mobile_backend directory not found; skipping mobile backend checks for this run"
  SKIP_MOBILE_BACKEND="1"
fi

wait_for_url() {
  local url="$1"
  local label="$2"
  local retries="${3:-45}"
  local delay="${4:-2}"

  for ((i = 1; i <= retries; i++)); do
    if curl --fail --silent --show-error "$url" >/dev/null; then
      echo "ready: ${label}"
      return 0
    fi
    sleep "$delay"
  done

  echo "timed out waiting for ${label} at ${url}" >&2
  return 1
}

echo "Starting integration stack"
echo "Building service images"
export MOCK_DETECTION
build_services=(ai-service parking-spot-interface)
if [[ "${SKIP_MOBILE_BACKEND}" != "1" ]]; then
  build_services+=(mobile-backend)
fi
docker compose -f "${COMPOSE_FILE}" build "${build_services[@]}"

services=(postgres redis localstack ai-service parking-spot-interface)
if [[ "${SKIP_MOBILE_BACKEND}" != "1" ]]; then
  services+=(mobile-backend)
fi
docker compose -f "${COMPOSE_FILE}" up -d "${services[@]}"

wait_for_url "http://localhost:8000/" "ai-service"
wait_for_url "http://localhost:3000/" "parking-spot-interface"
wait_for_url "http://localhost:3000/api/backend" "interface->ai rewrite"
if [[ "${SKIP_MOBILE_BACKEND}" != "1" ]]; then
  wait_for_url "http://localhost:8080/" "mobile-backend"
fi

echo "Preparing schema and fixture rows"
docker compose -f "${COMPOSE_FILE}" exec -T postgres psql -U postgres -d postgres <<'SQL'
CREATE TABLE IF NOT EXISTS parking_spot (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  total_ability INTEGER NOT NULL,
  image_url TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  lat REAL NOT NULL DEFAULT 0,
  long REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS coor_ability (
  id SERIAL PRIMARY KEY,
  parking_spot_id INTEGER NOT NULL REFERENCES parking_spot(id),
  x1 REAL NOT NULL,
  y1 REAL NOT NULL,
  x2 REAL NOT NULL,
  y2 REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS issue_report (
  id SERIAL PRIMARY KEY,
  parking_spot_id INTEGER NOT NULL REFERENCES parking_spot(id),
  reason TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  source TEXT NOT NULL DEFAULT 'mobile',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

TRUNCATE TABLE coor_ability RESTART IDENTITY CASCADE;
TRUNCATE TABLE issue_report RESTART IDENTITY CASCADE;
TRUNCATE TABLE parking_spot RESTART IDENTITY CASCADE;

INSERT INTO parking_spot (name, total_ability, lat, long) VALUES ('Test lot', 1, 13.0, 100.0);
INSERT INTO coor_ability (parking_spot_id, x1, y1, x2, y2) VALUES (1, 1, 1, 6, 6);
SQL

echo "Creating frame fixture"
tmp_file="$(mktemp)"
python3 - "$tmp_file" <<'PY'
import base64
import pathlib
import sys

png = b"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z5f0AAAAASUVORK5CYII="
pathlib.Path(sys.argv[1]).write_bytes(base64.b64decode(png))
PY

echo "Posting frame to ai-service"
frame_response="$(
  curl --fail --silent --show-error \
    -X POST "http://localhost:8000/frame" \
    -F "frame=@${tmp_file};filename=frame.png;type=image/png" \
    -F "parking_spot_id=1"
)"

rm -f "$tmp_file"

echo "Validating ai-service response"
python3 - "$frame_response" <<'PY'
import json
import sys

payload = json.loads(sys.argv[1])
assert payload["total"] == 1, payload
assert payload["occupied"] in (0, 1), payload
assert payload["available"] == payload["total"] - payload["occupied"], payload
assert len(payload["spots"]) == 1, payload
print("ai-service response contract ok")
PY

echo "Checking Redis occupancy key"
redis_payload="$(docker compose -f "${COMPOSE_FILE}" exec -T redis redis-cli GET occupancy:1 | tr -d '\r')"
if [[ -z "${redis_payload}" || "${redis_payload}" == "(nil)" ]]; then
  echo "occupancy:1 was not written to redis" >&2
  exit 1
fi

if [[ "${SKIP_MOBILE_BACKEND}" != "1" ]]; then
  echo "Checking mobile backend parking spots"
  mobile_response="$(curl --fail --silent --show-error "http://localhost:8080/parking-spots")"
  python3 - "$mobile_response" <<'PY'
import json
import sys

spots = json.loads(sys.argv[1])
assert isinstance(spots, list) and len(spots) >= 1, spots
spot = spots[0]
required = {"id", "name", "latitude", "longitude", "capacity", "availability"}
missing = required - set(spot.keys())
assert not missing, f"missing fields: {missing}; payload={spot}"
assert spot["id"] == 1, spot
print("mobile-backend contract ok")
PY
else
  echo "Skipping mobile-backend API contract check"
fi

echo "Checking interface rewrite contract"
rewrite_response="$(curl --fail --silent --show-error "http://localhost:3000/api/backend")"
python3 - "$rewrite_response" <<'PY'
import json
import sys

raw = sys.argv[1]
try:
    payload = json.loads(raw)
    assert payload["message"] == "KU PARKING SPOT MANAGEMENT SYSTEM", payload
except json.JSONDecodeError:
    assert "KU PARKING SPOT MANAGEMENT SYSTEM" in raw, raw
print("interface rewrite contract ok")
PY

echo "Full integration test passed"
