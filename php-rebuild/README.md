# Uganda Intercity Bus Booking (PHP rebuild)

## Quick start for a teammate opening this repository for the first time

No PHP or JavaScript experience is required to present the project. One person
should run the demo, while another explains the code.

### If the repository is already on the computer

```bash
cd uganda_Bus
git switch main
git pull --ff-only origin main
```

### If the repository is not on the computer

```bash
git clone https://github.com/Ikayo-softwareegineer/uganda_Bus.git
cd uganda_Bus
```

Then follow **Before the presentation** below. For Windows, PHP is usually
added with:

```powershell
winget install PHP.PHP.8.3
```

If `php` is not recognized, open a new PowerShell, run
`where.exe php`, or use `C:\laragon\bin\php\php.exe` in Laragon/XAMPP.

This project is a simpler rebuild of the bus booking app using:

- HTML
- CSS
- JavaScript
- PHP
- SQLite

## Group presentation guide

This section is written for every group member, including members who have not
previously worked on the repository. It explains what was implemented, where
the code is, how to demonstrate it, and what to say if the lecturer opens the
code.

### Before the presentation

```bash
# From an existing repository clone
cd uganda_Bus
git switch main
git pull --ff-only origin main

# One terminal: initialize the database
php php-rebuild/backend/api/init_db.php

# One terminal: start the website
cd php-rebuild
$env:ADMIN_PASSWORD="choose-a-demo-password" # Windows PowerShell
php -S 127.0.0.1:8000
```

Open `http://127.0.0.1:8000/frontend/pages/index.html`.

For a Linux, macOS or WSL terminal, set the environment instead:

```bash
cd uganda_Bus/php-rebuild
export ADMIN_PASSWORD="choose-a-demo-password"
php -S 127.0.0.1:8000
```

Useful demo accounts and setup:

1. Open the sign-in page and register a customer account.
2. In the admin login, use `admin@ugbus.com` and the password used in
   `ADMIN_PASSWORD`.
3. Add at least one route, bus and trip if the database has no sample data.
4. Open the customer seat page and make one confirmed booking.
5. Keep the booking reference displayed on the confirmation page.

Do not demonstrate a live payment: card, mobile-money and station-cash payments
are simulated. Do not commit or show an actual production password.

### Everyone: 30-second explanation

> “This is a three-layer bus booking system. HTML, CSS and JavaScript form the
> client, PHP APIs implement the application rules and sessions, and SQLite is
> the data layer. The project also contains separate socket, fork, message
> queue and Flask report implementations.”

### Team implementation map

| Member | Lecture implementation | Main code | Presentation result |
| --- | --- | --- | --- |
| Godson | Concurrency / database transactions | `backend/api/book.php`, `backend/api/cancel_booking.php` | Two users cannot reserve the same seat |
| Saraphina | TCP sockets | `socket_server/ticket_server.php`, `conductor_client.php` | A conductor checks a live ticket over TCP |
| Babirye | Event listeners | `frontend/js/ug/seats.js`, `frontend/js/admin.js`, `frontend/js/ug/checkout.js` | Mouse, arrow keys and Escape operate controls |
| Ikayo | JSON-RPC | `backend/api/rpc.php`, `frontend/js/ug/api.js` | Pages call `getTrips` and `getSeats` through RPC |
| Joshua | Middleware / security | `backend/api/config.php`, `backend/api/login.php` | Session authorization, login limits and security headers |
| Ronnie | Fork concurrent server | `socket_server/ticket_server_fork.php`, `socket_server/load_test.php` | Several conductors use the server concurrently |
| Johnbosco | Message queue / worker | `backend/api/notification_queue.php`, `notification_worker.php`, `backend/api/notifications.php` | Bookings create notifications processed in the background |
| Christlike | Client/server security | `backend/api/staff.php`, `backend/api/config.php`, `.htaccess`, `router.php` | Staff access, password hashing and database hiding |
| Yovan | Flask / three-tier architecture | `services/reports-service/`, `backend/api/reports.php` | The admin Reports tab receives Flask calculations |

---

### Godson — database transactions and seat safety

**Open:** `php-rebuild/backend/api/book.php`

**Say:** “The server starts `BEGIN IMMEDIATE` before checking availability.
It serializes requests and rechecks occupied seats inside the transaction.
It inserts the booking and updates available seats, then commits. If validation
fails, it rolls back.”

**Show:**

1. Open the seat map.
2. Try to choose seats already marked unavailable.
3. Open `book.php` and point out the transaction, clash check and commit.
4. Also open `backend/api/cancel_booking.php`; it uses the same transaction
   approach when seats are released.

### Saraphina — TCP ticket server

**Open:** `php-rebuild/socket_server/ticket_server.php`

**Say:** “This is a TCP stream server. It creates a socket, binds a port,
listens, accepts conductor connections, reads commands and writes replies.”

**Run in two terminals:**

```bash
# Terminal 1: Linux, macOS or WSL
cd uganda_Bus
TICKET_PIN=4821 php php-rebuild/socket_server/ticket_server.php 5050

# Terminal 2
cd uganda_Bus
php php-rebuild/socket_server/conductor_client.php 127.0.0.1 5050
```

At the conductor prompt enter:

```text
LOGIN 4821
CHECK <your-booking-reference>
BOARD <your-booking-reference>
BOARD <your-booking-reference>
```

The second board command should show that the ticket was already used.

### Babirye — event listeners

**Open:** `php-rebuild/frontend/js/ug/seats.js`

**Say:** “Seat clicks call `toggleSeat`. The seat grid listens for arrow-key
navigation, and Escape clears the selection. The admin dialog and checkout
payment popup also listen for Escape.”

**Show:** `frontend/js/admin.js`, `frontend/js/ug/checkout.js`

**Demonstrate:**

1. Select and deselect a seat with the mouse.
2. Tab to a seat and use Enter or Space.
3. Use the arrow keys in the seat map.
4. Press Escape and point out that selected seats are cleared.
5. Open an admin dialog and press Escape to close it.

### Ikayo — JSON-RPC

**Open:** `php-rebuild/backend/api/rpc.php`

**Say:** “The pages use JSON-RPC 2.0. The frontend sends a method and parameters;
the server dispatches `getTrips` or `getSeats` and returns a JSON-RPC result.”

**Show:** `frontend/js/ug/api.js`

**Example request:**

```bash
curl -X POST http://127.0.0.1:8000/backend/api/rpc.php \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"getTrips","params":{"passengers":1},"id":1}'
```

Then use `getSeats`:

```bash
curl -X POST http://127.0.0.1:8000/backend/api/rpc.php \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"getSeats","params":{"tripId":1},"id":2}'
```

The trip ID can be changed to an ID displayed in the schedules page.

### Joshua — middleware-style request protection

**Open:** `php-rebuild/backend/api/config.php` and
`php-rebuild/backend/api/login.php`

**Say:** “The shared PHP configuration acts as middleware: it starts the
session, validates roles, opens the database and adds security headers.
The login endpoint limits a session to five failed attempts in 15 minutes.”

**Demonstrate:**

1. Make five wrong login requests.
2. The sixth should show HTTP `429` and a 15-minute retry message.
3. Open `staff.php` without an admin session; it should return `401`.
4. Point out `requireLogin()` and `requireAnyRole()` in `config.php`.

**Be precise:** The project does not have a separate framework middleware file
or a shared HTTP request logger. The shared PHP configuration performs the
middleware-style protection for this project.

### Ronnie — fork server

**Open:** `php-rebuild/socket_server/ticket_server_fork.php`

**Say:** “The parent listens and accepts connections. It calls `pcntl_fork()`;
the child closes the listening socket and serves one conductor. The parent
tracks child processes and closes its copy of the connected socket.”

**Run on Linux or WSL:**

```bash
TICKET_PIN=4821 php php-rebuild/socket_server/ticket_server_fork.php 5051
php php-rebuild/socket_server/load_test.php --port=5051 --clients=5 --refs=<reference>
```

For a visible concurrent race:

```bash
TICKET_DEMO_DELAY_MS=1000 TICKET_PIN=4821 \
  php php-rebuild/socket_server/ticket_server_fork.php 5051

php php-rebuild/socket_server/load_test.php \
  --port=5051 --clients=10 --board=<reference>
```

Expected: one `BOARDED` and nine `USED`, because the transaction prevents
double boarding.

Windows normally cannot use `pcntl_fork()`; use the `socket_select()` server
for a Windows demonstration.

### Johnbosco — queue and background worker

**Open:** `php-rebuild/backend/api/notification_queue.php`

**Say:** “Bookings and cancellations enqueue SQLite jobs. The producer only
adds a job; a separate worker consumes it. Sent and failed jobs are recorded,
and failed jobs retry up to three times.”

**Start the worker:**

```bash
cd uganda_Bus/php-rebuild
php notification_worker.php --once
```

For continuous processing:

```bash
php notification_worker.php
```

**Demonstrate:**

1. Make a booking or cancellation.
2. Run `php notification_worker.php --once`.
3. Open `php-rebuild/notifications/` and show the generated JSON file.
4. Open `notification_queue.php` and show PENDING/SENT/FAILED state handling.

### Christlike — security

**Open:** `php-rebuild/backend/api/staff.php`,
`php-rebuild/backend/api/config.php`, `php-rebuild/router.php`
and `php-rebuild/.htaccess`.

**Say:** “Staff management now requires an admin session. Staff passwords use
`password_hash()`. Sessions are HTTP-only and SameSite=Lax. Security headers
protect framing and content sniffing. SQLite files are blocked from HTTP.”

**Demonstrate:**

1. Request `staff.php` while logged out: it returns `401`.
2. Log in as admin and open the staff/passenger management section.
3. Open `staff.php` and point to `password_hash()`.
4. Directly request `backend/api/data/bus_system.sqlite`; it should return `404`.
5. Inspect the response headers for `X-Frame-Options` and
   `X-Content-Type-Options`.

### Yovan — Flask reports

**Open:** `php-rebuild/backend/api/reports.php` and
`services/reports-service/reports.py`

**Say:** “This is a separate Python Flask service in the three-tier architecture.
The browser calls PHP, PHP checks that the user is admin, PHP forwards a shared
service key to Flask, and Flask reads SQLite and returns report JSON.”

**Run:**

```bash
cd uganda_Bus/services/reports-service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python app.py
```

In another terminal:

```bash
cd uganda_Bus
php -S 127.0.0.1:8000 -t php-rebuild
```

Log in as admin and open the Reports tab. Stop Flask and refresh: the tab should
show a clear offline state.

Run the tests:

```bash
cd services/reports-service
.venv/bin/python -m pytest -q
```

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
