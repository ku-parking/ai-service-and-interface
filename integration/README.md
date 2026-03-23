# Integration Test Harness

## Full stack (compose-backed)

Run:

```bash
./integration/full_stack_test.sh
```

What it validates:

- `parking_spot_interface` rewrite path (`/api/backend/*`) reaches `ai_service`
- `ai_service /frame` responds with expected contract and writes Redis occupancy
- `mobile_backend /parking-spots` responds with required fields and DB-backed rows (only when `mobile_backend` source is available)

By default the script tears down compose services when done. Set `KEEP_SERVICES=1` to leave the stack running for manual debugging.
Set `SKIP_MOBILE_BACKEND=1` to run integration checks for services in this repo only.

## Mobile backend contract track

See `integration/mobile_backend_contract.md` for the required API and test commands expected from the `mobile_backend` repo.
