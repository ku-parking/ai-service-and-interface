# Testing Guide

This repository contains test coverage for:

- `ai_service` (pytest unit + integration tests)
- `parking_spot_interface` (Vitest unit + integration tests)
- cross-service integration checks via Docker Compose

`KU-Parking-Mobile-App` is intentionally excluded.

## Local commands

### ai_service

```bash
cd ai_service
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
make test
make test-unit
make test-integration
```

### parking_spot_interface

```bash
cd parking_spot_interface
pnpm install --no-frozen-lockfile
pnpm test
pnpm test:integration
pnpm test:all
```

### Cross-service integration

```bash
./integration/full_stack_test.sh
```

If `mobile_backend` source is not available in this repository, run:

```bash
SKIP_MOBILE_BACKEND=1 ./integration/full_stack_test.sh
```

## Environment requirements

- Docker + Docker Compose
- Python 3.13+ for `ai_service` tests
- Node 20 + pnpm 10 for `parking_spot_interface` tests
- Services expected by integration script:
  - Postgres on compose service `postgres`
  - Redis on compose service `redis`
  - LocalStack (S3) on compose service `localstack`

## CI behavior

GitHub Actions runs:

- `ai_service` tests
- `parking_spot_interface` tests
- full-stack compose integration tests

The full integration job automatically skips mobile-backend checks when `mobile_backend` code is not present in the checked-out repository.
