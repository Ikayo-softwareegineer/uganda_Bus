# Uganda Bus · Reports service (Python + Flask)

A separate service that works out the reports on the admin dashboard's **Reports** tab.
It reads the same SQLite database as the PHP site, **read-only**, and answers in JSON.

Built by Yovan for SWE4107 Client-Server Programming
(lectures: *Flask-Python for our project*, and two-tier vs three-tier architecture in L1/L2).

## How it fits into the system

```
 Browser (admin.html)
     │  fetch('reports.php?type=all')        ← admin login checked here (PHP session)
     ▼
 PHP backend (backend/api/reports.php)
     │  GET /reports/all   + X-Service-Key   ← shared secret, 3 s timeout
     ▼
 Flask reports service (this folder, port 5001)
     │  read-only SQL through a connection pool
     ▼
 SQLite (php-rebuild/backend/api/data/bus_system.sqlite)
```

- The **browser never talks to Flask directly**. PHP checks that the user is the admin,
  then forwards the request. Flask only listens on `127.0.0.1` and refuses any request
  without the right `X-Service-Key`.
- If Flask is not running, `reports.php` answers **503** and the Reports tab shows a clear
  message plus basic figures worked out in the browser. The rest of the admin page keeps working.

## Run it

You need **Python 3.10+**. Run the PHP site at least once first, so the database exists.

### Ubuntu / macOS

```bash
cd services/reports-service
python3 -m venv .venv               # 1. virtual environment
source .venv/bin/activate           # 2. activate it: the prompt shows (.venv)
pip install -r requirements.txt     # 3. Flask, python-dotenv, pytest
cp .env.example .env                # 4. settings (edit REPORTS_SERVICE_KEY)
python app.py                       # 5. start: http://127.0.0.1:5001
```

On Ubuntu, if `python3 -m venv` fails, install it first: `sudo apt install python3-venv -y`.

### Windows

```bat
cd services\reports-service
python -m venv .venv
.\.venv\Scripts\Activate
pip install -r requirements.txt
copy .env.example .env
python app.py
```

### Run the whole system (two terminals)

| Terminal | Folder | Command |
| --- | --- | --- |
| 1 · PHP site | project root | `php -S localhost:8000` |
| 2 · Reports service | `services/reports-service` (venv active) | `python app.py` |

Open http://localhost:8000, log in as the admin, and open **Reports**.
The green **Live** banner means the numbers came from Flask.

**The key must match on both sides.** Flask reads `REPORTS_SERVICE_KEY` from `.env`; PHP reads
the environment variable of the same name. Both default to `dev-reports-key` for local use.
To use your own key, put it in `.env` and start PHP with it:

```bash
REPORTS_SERVICE_KEY=my-long-secret php -S localhost:8000
```

## Endpoints

Open http://127.0.0.1:5001 for a status page. Every `/reports/...` route needs the
`X-Service-Key` header.

| Method & path | Returns |
| --- | --- |
| `GET /health` | Service up, database found, pool size (no key needed) |
| `GET /reports/summary` | Bookings, revenue, seats sold, cancellation rate, cash due, refunds |
| `GET /reports/revenue-by-route` | Paid revenue, bookings and seats per route |
| `GET /reports/occupancy?days=7` | How full upcoming trips are, per route (days: 1–90) |
| `GET /reports/bookings-per-day?days=14` | Bookings and revenue per day; empty days show 0 |
| `GET /reports/payment-methods` | Confirmed bookings and amount per payment method |
| `GET /reports/operators` | Seats sold and revenue per bus operator |
| `GET /reports/all` | All of the above in one response (used by the admin page) |

Try one by hand:

```bash
curl http://127.0.0.1:5001/health
curl -H "X-Service-Key: dev-reports-key" http://127.0.0.1:5001/reports/summary
```

## Files

| File | What it does |
| --- | --- |
| `app.py` | `create_app()` factory: settings from `.env`, connection pool, routes, JSON errors |
| `db.py` | `SQLiteConnectionPool`: reusable read-only connections |
| `reports.py` | The report routes and their SQL (a Flask Blueprint) |
| `templates/index.html` | Status page shown with `render_template` |
| `tests/test_reports.py` | 10 tests on a temporary database |
| `requirements.txt` | Exact package versions (`pip freeze`) |
| `.env.example` | Settings to copy into `.env` (never commit `.env`) |

Outside this folder: `php-rebuild/backend/api/reports.php` (the PHP side) and the Reports
tab in `php-rebuild/frontend/js/admin.js`.

## Tests

```bash
python -m pytest -q
```

The tests build a small temporary database, so they never touch the real one. They check
the numbers, that a missing or wrong key gets **401**, that bad input gets **400**, that a
missing database gives **503**, and that the service **cannot write** to the database.

## How this follows the Flask lecture

| Slide | Where it is used here |
| --- | --- |
| `python -m venv .venv`, activate | Run steps above |
| `pip install`, `pip freeze > requirements.txt` | `requirements.txt` |
| `import os`, `from pathlib import Path`, `from contextlib import closing` | `app.py`, `reports.py` (`closing()` around every cursor) |
| `from dotenv import load_dotenv` | `app.py` loads `.env` |
| `def create_app() -> Flask`, `app.secret_key` | `app.py` |
| `app.config.update(...)` from environment variables | `app.py` (database path, key, pool size) |
| Connection pool (`MySQLConnectionPool`, `pool_size=5`) | `db.py`: the same idea for SQLite |
| Routes, `render_template` | `reports.py` routes, `/` status page |

**Differences from the slides, and why:** the slides use MySQL; our system stores its data
in SQLite, so `db.py` builds the pool with Python's built-in `sqlite3` module. The service
only **reads** (`mode=ro`), because the PHP site owns the data. It returns JSON instead of
HTML pages, because its client is another program (PHP), not a person.

## Deployment note

On Render, the PHP site runs in its own container, and a second service cannot read that
container's SQLite file. For the demo, run both on one machine as shown above. To deploy it
for real, either run Flask in the same container as PHP, or move the data to a shared
database server (e.g. PostgreSQL or MySQL) that both services connect to.

## Interview-style questions

1. Why does the browser call `reports.php` instead of calling Flask directly?
2. What does the connection pool save, and what happens when all 5 connections are busy?
3. Why is `hmac.compare_digest` used to check the key instead of `==`?
4. What does the admin see if Flask is stopped, and which lecture topic does that relate to?
5. Is this two-tier or three-tier? Draw the tiers and say what runs in each.
