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

With PHP installed, from the repository root:

```bash
php -S localhost:8000
```

Or with Docker (the same setup Render uses):

```bash
docker build -t uganda-bus .
docker run -p 8000:80 uganda-bus
```

Then open http://localhost:8000

The SQLite database (`backend/api/data/bus_system.sqlite`) is created and
seeded automatically on the first request. `php backend/api/init_db.php`
re-runs the setup by hand if needed.

## Admin login

The admin account is hard-coded in `backend/api/config.php`:

- Email: `admin@ugandabus.com`
- Password: `Admin@123`

The admin dashboard (`frontend/pages/admin.html`) manages bookings,
passengers, trips, buses, routes and payments, and shows reports.

## Demo accounts

Created automatically with the database (also on the sign-in page as quick buttons):

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@ugandabus.com` | `Admin@123` |
| Staff | `staff@ugandabus.com` | `Staff@123` |
| Customer | `passenger@ugandabus.com` | `Passenger@123` |

The admin can add more staff from **Passengers** (set Role to *Staff*).

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

If you ran an older version before, delete `backend/api/data/` once so the database is
recreated with the new routes, coaches and demo accounts.

## Deploy on Render

`render.yaml` deploys the whole app (pages + PHP API) as a Docker web
service using the `Dockerfile` in the repository root.

1. In Render, choose **New > Blueprint** and connect this repository.
2. Select the `main` branch.

On the free plan Render's disk is temporary, so the database is reset to the
sample data on every deploy or restart. To keep data, use a paid plan and
uncomment the `disk` section in `render.yaml`.
