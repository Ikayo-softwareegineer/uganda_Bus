"""
Uganda Bus - Reports service (Python + Flask)

A small separate service that works out the reports for the admin dashboard.
It reads the same SQLite database as the PHP site, but only reads it.

    Browser (admin.html) --> PHP (backend/api/reports.php) --> this Flask service --> SQLite

Run it:
    python app.py            (listens on http://127.0.0.1:5001 by default)
"""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template

from db import SQLiteConnectionPool
from reports import bp as reports_bp

BASE_DIR = Path(__file__).resolve().parent

# The PHP site keeps its database here (relative to this folder)
DEFAULT_DB_PATH = BASE_DIR.parent.parent / "php-rebuild" / "backend" / "api" / "data" / "bus_system.sqlite"

# Read settings from .env (copy .env.example to .env); real environment variables win
load_dotenv(BASE_DIR / ".env")

log = logging.getLogger("reports-service")


def create_app(test_config=None) -> Flask:
    """Application factory: builds and configures the Flask app."""
    app = Flask(__name__)
    app.secret_key = os.environ.get("FLASK_SECRET_KEY", "dev-secret-key")

    # Settings come from environment variables, with defaults for local development
    app.config.update(
        DB_PATH=os.environ.get("REPORTS_DB_PATH") or str(DEFAULT_DB_PATH),
        SERVICE_KEY=os.environ.get("REPORTS_SERVICE_KEY") or "dev-reports-key",
        POOL_SIZE=int(os.environ.get("REPORTS_POOL_SIZE", "5")),
        JSON_SORT_KEYS=False,
    )
    if test_config:
        app.config.update(test_config)

    if app.config["SERVICE_KEY"] == "dev-reports-key":
        log.warning("Using the default service key. Set REPORTS_SERVICE_KEY in .env before deploying.")

    # Connection pool: connections are reused instead of opened for every request
    app.db_pool = SQLiteConnectionPool(app.config["DB_PATH"], pool_size=app.config["POOL_SIZE"])

    app.register_blueprint(reports_bp)

    # ---------- Routes that need no service key ----------

    @app.get("/")
    def home():
        """A simple status page for people (render_template + templates/index.html)."""
        db_path = Path(app.config["DB_PATH"])
        return render_template(
            "index.html",
            db_found=db_path.exists(),
            db_path=db_path,
            pool_size=app.config["POOL_SIZE"],
        )

    @app.get("/health")
    def health():
        """Used by the PHP backend and by monitoring to check the service is up."""
        db_found = Path(app.config["DB_PATH"]).exists()
        return jsonify(
            success=True,
            service="uganda-bus-reports",
            database="found" if db_found else "missing",
            pool={"size": app.db_pool.pool_size, "in_use": app.db_pool.in_use},
        ), (200 if db_found else 503)

    # ---------- Errors always come back as JSON, never as a crash page ----------

    @app.errorhandler(404)
    def not_found(error):
        return jsonify(success=False, message="No such report."), 404

    @app.errorhandler(405)
    def method_not_allowed(error):
        return jsonify(success=False, message="Reports are read-only: use GET."), 405

    @app.errorhandler(500)
    def server_error(error):
        log.exception("Report failed")
        return jsonify(success=False, message="The reports service had an internal error."), 500

    return app


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    # 127.0.0.1 = only programs on this computer (our PHP backend) can reach the service
    host = os.environ.get("REPORTS_HOST", "127.0.0.1")
    port = int(os.environ.get("REPORTS_PORT", "5001"))
    create_app().run(host=host, port=port, debug=os.environ.get("FLASK_DEBUG") == "1")
