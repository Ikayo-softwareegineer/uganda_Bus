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

## Deploy on Render

`render.yaml` deploys the whole app (pages + PHP API) as a Docker web
service using the `Dockerfile` in the repository root.

1. In Render, choose **New > Blueprint** and connect this repository.
2. Select the `main` branch.

On the free plan Render's disk is temporary, so the database is reset to the
sample data on every deploy or restart. To keep data, use a paid plan and
uncomment the `disk` section in `render.yaml`.
