"""
Tests for the reports service.   Run from services/reports-service:   python -m pytest -q

Each test builds a small temporary SQLite database with the same tables and
columns the PHP site uses, so the tests never touch the real database.
"""

import sqlite3
import sys
from datetime import datetime, timedelta
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import create_app  # noqa: E402

KEY = "test-key"
HEADERS = {"X-Service-Key": KEY}


def build_database(path):
    conn = sqlite3.connect(path)
    conn.executescript("""
        CREATE TABLE routes (id INTEGER PRIMARY KEY, origin TEXT, destination TEXT,
                             distance_km INTEGER, duration TEXT, price_ugx INTEGER);
        CREATE TABLE vehicles (id INTEGER PRIMARY KEY, reg_number TEXT, model TEXT, total_seats INTEGER,
                               operator_name TEXT, driver_name TEXT, status TEXT DEFAULT 'ACTIVE');
        CREATE TABLE trips (id INTEGER PRIMARY KEY, route_id INTEGER, vehicle_id INTEGER,
                            departure_time TEXT, arrival_time TEXT, price_ugx INTEGER,
                            available_seats INTEGER, status TEXT DEFAULT 'SCHEDULED');
        CREATE TABLE bookings (id INTEGER PRIMARY KEY, booking_ref TEXT, user_name TEXT, phone TEXT, email TEXT,
                               trip_id INTEGER, seats TEXT, total_amount INTEGER, payment_method TEXT,
                               payment_status TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                               status TEXT DEFAULT 'CONFIRMED', verified_at TEXT);
    """)
    tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d 08:00:00")
    conn.execute("INSERT INTO routes VALUES (1, 'Kampala', 'Mbarara', 270, '4h 30m', 30000)")
    conn.execute("INSERT INTO routes VALUES (2, 'Kampala', 'Gulu', 335, '5h 30m', 40000)")
    conn.execute("INSERT INTO vehicles VALUES (1, 'UBF 892K', 'Scania', 36, 'Uganda Coach Express', 'Okello', 'ACTIVE')")
    conn.execute("INSERT INTO vehicles VALUES (2, 'UBA 104F', 'Scania', 36, 'Global Coaches', 'Alex', 'ACTIVE')")
    # Trip 1: 3 seats taken. Trip 2: 1 seat taken.
    conn.execute("INSERT INTO trips VALUES (1, 1, 1, ?, ?, 30000, 33, 'SCHEDULED')", (tomorrow, tomorrow))
    conn.execute("INSERT INTO trips VALUES (2, 2, 2, ?, ?, 40000, 35, 'SCHEDULED')", (tomorrow, tomorrow))
    rows = [
        # ref, trip, seats, total, method, payment_status, status, verified
        ("UG-1", 1, "1A,1B", 60000, "MTN_MOMO", "PAID", "CONFIRMED", "2026-01-01 08:00:00"),
        ("UG-2", 1, "2A", 30000, "CASH_AT_STATION", "PAY_AT_STATION", "CONFIRMED", None),
        ("UG-3", 2, "1A", 40000, "VISA_CARD", "PAID", "CONFIRMED", None),
        ("UG-4", 2, "3C", 40000, "AIRTEL_MONEY", "REFUNDED", "CANCELLED", None),
    ]
    for ref, trip, seats, total, method, pay, status, verified in rows:
        conn.execute(
            "INSERT INTO bookings (booking_ref, user_name, phone, email, trip_id, seats, total_amount, "
            "payment_method, payment_status, status, verified_at) VALUES (?, 'Test', '0772000000', 't@t.ug', ?, ?, ?, ?, ?, ?, ?)",
            (ref, trip, seats, total, method, pay, status, verified),
        )
    conn.commit()
    conn.close()


@pytest.fixture()
def client(tmp_path):
    db_path = tmp_path / "bus_system.sqlite"
    build_database(db_path)
    app = create_app({"DB_PATH": str(db_path), "SERVICE_KEY": KEY, "POOL_SIZE": 2, "TESTING": True})
    with app.test_client() as test_client:
        yield test_client
    app.db_pool.close_all()


def test_health_needs_no_key(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.get_json()["database"] == "found"


def test_reports_reject_missing_or_wrong_key(client):
    assert client.get("/reports/summary").status_code == 401
    assert client.get("/reports/summary", headers={"X-Service-Key": "wrong"}).status_code == 401


def test_summary_numbers(client):
    summary = client.get("/reports/summary", headers=HEADERS).get_json()["summary"]
    assert summary["total_bookings"] == 4
    assert summary["confirmed_bookings"] == 3
    assert summary["cancelled_bookings"] == 1
    assert summary["seats_sold"] == 4            # 1A,1B + 2A + 1A (cancelled booking not counted)
    assert summary["revenue"] == 100000          # only PAID bookings: 60,000 + 40,000
    assert summary["refunded_amount"] == 40000
    assert summary["cash_due"] == 30000
    assert summary["boarded_bookings"] == 1
    assert summary["cancellation_rate"] == 25.0
    assert summary["average_booking_value"] == 50000


def test_revenue_by_route(client):
    routes = client.get("/reports/revenue-by-route", headers=HEADERS).get_json()["routes"]
    assert routes[0] == {"route": "Kampala → Mbarara", "bookings": 1, "seats": 2, "revenue": 60000}
    assert routes[1]["route"] == "Kampala → Gulu"
    assert routes[1]["revenue"] == 40000


def test_occupancy(client):
    data = client.get("/reports/occupancy?days=7", headers=HEADERS).get_json()
    mbarara = next(r for r in data["routes"] if r["route"] == "Kampala → Mbarara")
    assert mbarara["seats_booked"] == 3
    assert mbarara["occupancy_percent"] == round(3 * 100 / 36, 1)


def test_days_must_be_valid(client):
    assert client.get("/reports/occupancy?days=0", headers=HEADERS).status_code == 400
    assert client.get("/reports/occupancy?days=abc", headers=HEADERS).status_code == 400
    assert client.get("/reports/bookings-per-day?days=500", headers=HEADERS).status_code == 400


def test_bookings_per_day_fills_empty_days(client):
    series = client.get("/reports/bookings-per-day?days=5", headers=HEADERS).get_json()["series"]
    assert len(series) == 5
    assert sum(day["bookings"] for day in series) == 4   # all test bookings were made today


def test_all_in_one(client):
    data = client.get("/reports/all", headers=HEADERS).get_json()
    for key in ("summary", "revenue_by_route", "occupancy", "bookings_per_day", "payment_methods", "operators"):
        assert key in data
    labels = {m["label"] for m in data["payment_methods"]}
    assert "MTN Mobile Money" in labels


def test_service_cannot_change_data(client):
    """The pool opens the database read-only: any write must fail."""
    app = client.application
    with app.app_context():
        with app.db_pool.connection() as conn:
            with pytest.raises(sqlite3.OperationalError):
                conn.execute("DELETE FROM bookings")


def test_missing_database_gives_503(tmp_path):
    app = create_app({"DB_PATH": str(tmp_path / "nope.sqlite"), "SERVICE_KEY": KEY})
    res = app.test_client().get("/reports/summary", headers=HEADERS)
    assert res.status_code == 503
    assert "not found" in res.get_json()["message"]
