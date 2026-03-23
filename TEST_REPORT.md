# Test Report

Date: 2026-03-23

## Scope

- Included services:
  - `ai_service`
  - `parking_spot_interface`
  - cross-service integration harness in this repo
- Excluded:
  - `KU-Parking-Mobile-App`
- Mobile backend:
  - contract tracked via `integration/mobile_backend_contract.md`
  - integration script supports skipping with `SKIP_MOBILE_BACKEND=1`

## Implemented test suites

### ai_service

- Test framework: `pytest`
- Files:
  - `ai_service/tests/test_setting.py`
  - `ai_service/tests/test_redis_client.py`
  - `ai_service/tests/test_db.py`
  - `ai_service/tests/test_main_endpoints.py`
- Coverage focus:
  - env/settings loading defaults
  - Redis singleton and cache write paths
  - DB coordinate cache behavior
  - FastAPI endpoint contracts (`/`, `/init`, `/frame`)

Result:

- Command: `.venv/bin/python -m pytest`
- Status: Pass
- Summary: `7 passed`

### parking_spot_interface

- Test framework: `Vitest`
- Files:
  - `parking_spot_interface/tests/unit/api.test.ts`
  - `parking_spot_interface/tests/unit/env.test.ts`
  - `parking_spot_interface/tests/integration/actions.integration.test.ts`
  - `parking_spot_interface/tests/integration/rewrites.integration.test.ts`
- Coverage focus:
  - backend API wrapper success/failure behavior
  - env validation behavior
  - server action seam behavior with mocked DB/S3
  - rewrite contract expectation

Result:

- Commands:
  - `pnpm test`
  - `pnpm test:integration`
- Status: Pass
- Summary: `8 passed` total (5 unit + 3 integration)

### Cross-service integration harness

- Harness: `integration/full_stack_test.sh`
- Validation flow:
  - compose startup readiness checks
  - DB schema + fixture seed
  - `ai_service /frame` response and Redis occupancy key assertion
  - interface rewrite assertion through `/api/backend`
  - optional mobile-backend contract check

Result:

- Command: `SKIP_MOBILE_BACKEND=1 ./integration/full_stack_test.sh`
- Status: Pass
- Summary: full flow completed and printed `Full integration test passed`
- Command: `./integration/full_stack_test.sh` (mobile backend enabled)
- Status: Pass
- Summary: full flow completed with `mobile-backend contract ok` and `Full integration test passed`

## Stability fixes applied during validation

- Fixed Next.js production build issue by moving `parseSpots` out of a `"use server"` file into `parking_spot_interface/src/lib/spot-parser.ts`.
- Made integration script deterministic by rebuilding service images before startup.
- Added `MOCK_DETECTION` support to `ai_service` and defaulted integration runs to mocked detection (`MOCK_DETECTION=1`) for stable `/frame` checks.
- Adjusted rewrite assertion to use `/api/backend` (non-redirect endpoint).

## CI status design

- Push/PR CI runs per-service tests (`ai_service`, `parking_spot_interface`).
- Full-stack integration is available as manual workflow dispatch to avoid false failures when external service availability varies.
