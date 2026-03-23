# ai_service Testing

## Install

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

## Run tests

```bash
make test
make test-unit
make test-integration
```

The test suite covers settings/env parsing, Redis client behavior, DB coordinate caching, and FastAPI endpoint contract checks.
