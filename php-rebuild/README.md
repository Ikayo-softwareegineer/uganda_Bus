# Uganda Intercity Bus Booking (PHP rebuild)

This project is a simpler rebuild of the bus booking app using:

- HTML
- CSS
- JavaScript
- PHP
- SQLite

## Folder structure

- `frontend/pages/` - HTML pages
- `frontend/css/` - styles
- `frontend/js/` - frontend logic
- `backend/api/` - PHP API files and SQLite database
- `index.html` - redirect to the frontend home page

## Run locally

Set `ADMIN_PASSWORD` in the server environment before starting it. In PowerShell,
you can enter it for the current session with:

```powershell
$env:ADMIN_PASSWORD = Read-Host -Prompt 'Admin password'
php -S localhost:8000
```

On Windows, run `php-rebuild/start-local.bat` from that same PowerShell session
to start the PHP server and open the site. Do not open an `index.html` file
directly: browsers do not run the PHP API over `file://`.

Or with Docker (the same setup Render uses):

```powershell
docker build -t uganda-bus .
$env:ADMIN_PASSWORD = Read-Host -Prompt 'Admin password'
docker run -p 8000:80 -e ADMIN_PASSWORD uganda-bus
```

Then open http://localhost:8000

The SQLite database (`backend/api/data/bus_system.sqlite`) is created on the
first request without sample routes, buses, trips, or accounts.
`php backend/api/init_db.php` re-runs the setup by hand if needed. Add routes,
buses, and trips from the admin dashboard before taking bookings.

## Admin login

The administrator email is fixed in `backend/api/config.php`:

- Email: `admin@ugbus.com`

The password comes from the `ADMIN_PASSWORD` environment variable and is not
stored in the repository. Admin login is unavailable until it is configured.

The admin dashboard (`frontend/pages/admin.html`) manages bookings,
passengers, trips, buses, routes and payments, and shows reports.

## Security

- Staff creation and staff-directory APIs require an administrator session.
- Staff passwords use PHP `password_hash()` and legacy plaintext passwords are
  rehashed automatically when the database schema is upgraded.
- Login attempts are limited to five failures per 15-minute session window.
- PHP sessions use HTTP-only, SameSite=Lax cookies and secure cookies over HTTPS.
- API responses send anti-framing and content-sniffing headers.
- Apache/Docker blocks requests for SQLite files and database journal files.

From **Passengers**, the admin can add and manage member and staff accounts.
Members can also register from the sign-in page.

## Booking notification queue

Confirmed bookings and cancellations enqueue email jobs in
`backend/api/data/bus_system.sqlite`. A separate PHP worker processes those jobs
and writes the generated notifications to `php-rebuild/notifications/`.

```powershell
# Process all currently available jobs once
php notification_worker.php --once

# Keep polling every two seconds
php notification_worker.php
```

Run the command from the `php-rebuild` folder. For an admin to process pending
jobs and view queue status, call `backend/api/notifications.php`:

- `GET` requires an admin session and shows pending/sent/failed totals
- `POST {"action":"process"}` processes up to 20 queued notifications

## How the frontend is organised

The pages use the UG Express design. Everything is plain HTML, CSS and JavaScript,
talking to the PHP API with `fetch`.

- `frontend/pages/` – the pages (see the table below)
- `frontend/css/ug-express.css` – the site design; `admin.css` – the admin dashboard
- `frontend/js/ug/` – one script per page, plus:
  - `api.js` – the **only** file that calls the PHP backend; turns database rows into page objects
  - `auth.js` – who is logged in (checks the PHP session through `me.php`)
  - `navbar.js` – shared top menu and footer
- `frontend/js/admin.js` + `site.js` – the admin dashboard
- `frontend/images/` – pictures

Trip search and seat selection use the JSON-RPC 2.0 endpoint at
`backend/api/rpc.php`. Send a `POST` request with `jsonrpc: "2.0"`, a method,
named `params`, and an `id`. The `getTrips` method accepts optional `origin`,
`destination`, `date` (`YYYY-MM-DD`), and `passengers` parameters and returns
`result.trips` and `result.count`. The `getSeats` method accepts `tripId` and
returns the trip and its currently booked seats in `result.trip`. RPC errors
use the JSON-RPC `error` object; the frontend API client handles the response
and maps the trip data for the pages.

| Page | Who | What it does |
| --- | --- | --- |
| `index.html` | Everyone | Plan your journey: search form, popular routes, amenities |
| `schedules.html` | Everyone | Timetable of all departures, filter by route, date, operator |
| `search.html` | Everyone | Search results, sort by time or fare, filter by operator |
| `seats.html` | Everyone | Seat map for a trip |
| `checkout.html` | Customers | Details for each passenger, payment window |
| `confirmation.html` | Customers | E-ticket with QR code and live status (valid, used, cancelled) |
| `dashboard.html` | Customers | My bookings: totals, view ticket, cancel before departure |
| `auth.html` | Everyone | Sign in / register (old `login.html` and `register.html` redirect here) |
| `staff.html` | Staff, admin | Check tickets at boarding; each ticket works once |
| `admin.html` | Admin | Manage bookings, passengers and staff, trips, buses, routes, payments, reports |

Payments are **simulated**: no money moves and card or mobile money details are never sent to the server.

On upgrade, legacy demo accounts and bookings are removed. The bundled sample
routes, buses, and trips are cleared when the database still matches the original
demo dataset; other operational data is preserved.

## Reports service (Python + Flask)

The admin's **Reports** tab gets its figures from a separate Flask service in
`services/reports-service/` (at the repository root). Start it in a second terminal:

```bash
cd services/reports-service
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python app.py            # http://127.0.0.1:5001
```

`backend/api/reports.php` forwards the admin's request to it. If the service is not
running, the Reports tab says so and shows basic figures instead. Full details:
`services/reports-service/README.md`.

## Deploy on Render

`render.yaml` deploys the whole app (pages + PHP API) as a Docker web
service using the `Dockerfile` in the repository root.

1. In Render, choose **New > Blueprint** and connect this repository.
2. Select the `main` branch.

On the free plan Render's disk is temporary, so operational data is reset on
every deploy or restart. To keep data, use a paid plan and uncomment the `disk`
section in `render.yaml`.
