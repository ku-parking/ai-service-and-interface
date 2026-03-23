# Mobile Backend Test Contract

This repository treats `mobile_backend` as a separate service track. The contract below defines what the mobile backend repo must provide so cross-service integration tests can run reliably.

## Required commands in mobile backend repo

- `go test ./...` for unit tests.
- `go test -tags=integration ./...` (or equivalent `make test-integration`) for DB/Redis-backed tests.
- A repeatable command that starts only the service dependencies needed for integration tests (Postgres + Redis), or testcontainers-based setup.

## API contract expected by other services

- `GET /` returns `200` with `{ "status": "ok" }`.
- `GET /parking-spots` returns `200` and an array of:
  - `id`, `name`, `latitude`, `longitude`, `capacity`, `availability`
  - optional `updated_at` when Redis occupancy data exists
- `POST /issue-reports`:
  - accepts JSON `{ "parking_spot_id": number, "reason": string, "notes": string }`
  - returns `201` with created report fields on success
  - returns `400` for invalid payload
  - returns `404` if parking spot does not exist

## Integration assertions the mobile backend repo should own

- **Service health**: server boots with required env (`DATABASE_URL`, optional `REDIS_URL`) and health endpoint responds.
- **DB contract**: `GET /parking-spots` reads rows from `parking_spot`.
- **Redis contract**: occupancy keys `occupancy:<id>` update `availability` and `updated_at`.
- **Issue reports**: valid request persists to `issue_report`; invalid and missing-spot paths return correct status codes.

## Cross-repo orchestration expectation

When this repo runs full-stack integration checks, the mobile backend service must be reachable at `http://localhost:8080` and honor the contract above.
