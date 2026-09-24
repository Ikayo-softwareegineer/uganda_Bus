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
