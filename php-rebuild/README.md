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

From the project folder:

```bash
php -S localhost:8000
```

Then open:

```text
http://localhost:8000
```

## Database setup

First initialize the SQLite database:

```bash
php backend/api/init_db.php
```

Then open the app in the browser.

## Deploy the frontend on Render

This repository includes a `render.yaml` Blueprint for deploying the frontend as a Render Static Site.

1. In Render, choose **New > Blueprint** and connect this repository.
2. Select the `main` branch.
3. Render will use `php-rebuild` as the site root and publish the frontend automatically.

The current browser booking flow uses localStorage, so bookings are stored per browser. The PHP API and SQLite database are not executed by a Static Site. To use those backend APIs in production, deploy the PHP backend separately with a PHP-capable Docker service and configure the frontend API URLs.
