"""
Report routes for the admin dashboard.

Every route reads the Uganda Bus SQLite database (read-only) and returns JSON.
The PHP backend (backend/api/reports.php) calls these routes for the admin's
Reports tab, sending the shared secret in the X-Service-Key header.
"""

import hmac
from contextlib import closing
from datetime import date, timedelta

from flask import Blueprint, current_app, jsonify, request

from db import DatabaseUnavailable

bp = Blueprint("reports", __name__, url_prefix="/reports")

# Number of seats in a booking: "1A,1B,2C" -> 3
SEAT_COUNT_SQL = "(LENGTH(b.seats) - LENGTH(REPLACE(b.seats, ',', '')) + 1)"

PAYMENT_LABELS = {
    "MTN_MOMO": "MTN Mobile Money",
    "AIRTEL_MONEY": "Airtel Money",
    "VISA_CARD": "Visa Card",
    "CASH_AT_STATION": "Cash at station",
}


# ---------- Security: only our PHP backend may call these routes ----------

@bp.before_request
def require_service_key():
    expected = current_app.config["SERVICE_KEY"]
    sent = request.headers.get("X-Service-Key", "")
    # compare_digest takes the same time whatever the input, so the key cannot be guessed letter by letter
    if not hmac.compare_digest(sent.encode(), expected.encode()):
        return jsonify(success=False, message="Missing or wrong service key."), 401
    return None


# ---------- Small helpers ----------

def query(sql, params=()):
    """Run a SELECT on a pooled connection and return a list of dictionaries."""
    pool = current_app.db_pool
    with pool.connection() as conn:
        with closing(conn.cursor()) as cursor:  # closing() frees the cursor even if the query fails
            cursor.execute(sql, params)
            return [dict(row) for row in cursor.fetchall()]


def days_param(default):
    """Read ?days=N from the URL; only 1 to 90 is allowed."""
    raw = request.args.get("days", default)
    try:
        days = int(raw)
    except (TypeError, ValueError):
        days = 0
    if not 1 <= days <= 90:
        raise ValueError("days must be a whole number from 1 to 90")
    return days


@bp.errorhandler(ValueError)
def bad_request(error):
    return jsonify(success=False, message=str(error)), 400


@bp.errorhandler(DatabaseUnavailable)
def database_unavailable(error):
    return jsonify(success=False, message=str(error)), 503


# ---------- The reports ----------

def summary_report():
    row = query(f"""
        SELECT
            COUNT(*)                                                             AS total_bookings,
            SUM(CASE WHEN b.status = 'CONFIRMED' THEN 1 ELSE 0 END)              AS confirmed_bookings,
            SUM(CASE WHEN b.status = 'CANCELLED' THEN 1 ELSE 0 END)              AS cancelled_bookings,
            SUM(CASE WHEN b.status = 'CONFIRMED' THEN {SEAT_COUNT_SQL} ELSE 0 END) AS seats_sold,
            SUM(CASE WHEN b.payment_status = 'PAID' THEN b.total_amount ELSE 0 END)     AS revenue,
            SUM(CASE WHEN b.payment_status = 'PAID' THEN 1 ELSE 0 END)                  AS paid_bookings,
            SUM(CASE WHEN b.payment_status = 'REFUNDED' THEN b.total_amount ELSE 0 END) AS refunded_amount,
            SUM(CASE WHEN b.payment_status = 'PAY_AT_STATION' AND b.status = 'CONFIRMED'
                     THEN b.total_amount ELSE 0 END)                              AS cash_due,
            SUM(CASE WHEN b.verified_at IS NOT NULL THEN 1 ELSE 0 END)            AS boarded_bookings
        FROM bookings b
    """)[0]
    # SUM() gives NULL on an empty table: turn every NULL into 0
    totals = {key: int(value or 0) for key, value in row.items()}
    total = totals["total_bookings"]
    totals["cancellation_rate"] = round(totals["cancelled_bookings"] * 100 / total, 1) if total else 0
    totals["average_booking_value"] = round(totals["revenue"] / totals["paid_bookings"]) if totals["paid_bookings"] else 0
    return totals


def revenue_by_route_report():
    rows = query(f"""
        SELECT r.origin || ' → ' || r.destination AS route,
               COUNT(*)                         AS bookings,
               SUM({SEAT_COUNT_SQL})            AS seats,
               SUM(b.total_amount)              AS revenue
        FROM bookings b
        JOIN trips t  ON t.id = b.trip_id
        JOIN routes r ON r.id = t.route_id
        WHERE b.payment_status = 'PAID'
        GROUP BY r.id
        ORDER BY revenue DESC
    """)
    return rows


def occupancy_report(days):
    """How full the buses are on trips departing in the next `days` days, per route."""
    rows = query("""
        SELECT r.origin || ' → ' || r.destination        AS route,
               COUNT(*)                                   AS trips,
               SUM(v.total_seats)                         AS seats_offered,
               SUM(v.total_seats - t.available_seats)     AS seats_booked
        FROM trips t
        JOIN routes r   ON r.id = t.route_id
        JOIN vehicles v ON v.id = t.vehicle_id
        WHERE t.status = 'SCHEDULED'
          AND t.departure_time >= datetime('now', 'localtime')
          AND t.departure_time <  datetime('now', 'localtime', ?)
        GROUP BY r.id
        ORDER BY seats_booked DESC, route
    """, (f"+{days} days",))
    for row in rows:
        offered = row["seats_offered"] or 0
        row["occupancy_percent"] = round(row["seats_booked"] * 100 / offered, 1) if offered else 0
    return rows


def bookings_per_day_report(days):
    """Bookings made on each of the last `days` days (days with none show 0)."""
    rows = query("""
        SELECT date(b.created_at, 'localtime') AS day,
               COUNT(*)                         AS bookings,
               SUM(CASE WHEN b.payment_status = 'PAID' THEN b.total_amount ELSE 0 END) AS revenue
        FROM bookings b
        WHERE date(b.created_at, 'localtime') > date('now', 'localtime', ?)
        GROUP BY day
    """, (f"-{days} days",))
    by_day = {row["day"]: row for row in rows}
    today = date.today()
    result = []
    for offset in range(days - 1, -1, -1):
        day = (today - timedelta(days=offset)).isoformat()
        row = by_day.get(day, {})
        result.append({"day": day, "bookings": row.get("bookings", 0), "revenue": row.get("revenue", 0) or 0})
    return result


def payment_methods_report():
    rows = query("""
        SELECT b.payment_method AS method,
               COUNT(*)          AS bookings,
               SUM(b.total_amount) AS amount
        FROM bookings b
        WHERE b.status = 'CONFIRMED'
        GROUP BY b.payment_method
        ORDER BY bookings DESC
    """)
    for row in rows:
        row["label"] = PAYMENT_LABELS.get(row["method"], row["method"])
    return rows


def operators_report():
    return query(f"""
        SELECT v.operator_name                                     AS operator,
               SUM({SEAT_COUNT_SQL})                                AS seats_sold,
               SUM(CASE WHEN b.payment_status = 'PAID' THEN b.total_amount ELSE 0 END) AS revenue
        FROM bookings b
        JOIN trips t    ON t.id = b.trip_id
        JOIN vehicles v ON v.id = t.vehicle_id
        WHERE b.status = 'CONFIRMED'
        GROUP BY v.operator_name
        ORDER BY seats_sold DESC
    """)


# ---------- Routes ----------

@bp.get("/summary")
def summary():
    return jsonify(success=True, summary=summary_report())


@bp.get("/revenue-by-route")
def revenue_by_route():
    return jsonify(success=True, routes=revenue_by_route_report())


@bp.get("/occupancy")
def occupancy():
    days = days_param(7)
    return jsonify(success=True, days=days, routes=occupancy_report(days))


@bp.get("/bookings-per-day")
def bookings_per_day():
    days = days_param(14)
    return jsonify(success=True, days=days, series=bookings_per_day_report(days))


@bp.get("/payment-methods")
def payment_methods():
    return jsonify(success=True, methods=payment_methods_report())


@bp.get("/operators")
def operators():
    return jsonify(success=True, operators=operators_report())


@bp.get("/all")
def all_reports():
    """Every report in one response, so the admin page needs only one round trip."""
    occupancy_days = days_param(7)
    return jsonify(
        success=True,
        summary=summary_report(),
        revenue_by_route=revenue_by_route_report(),
        occupancy={"days": occupancy_days, "routes": occupancy_report(occupancy_days)},
        bookings_per_day={"days": 14, "series": bookings_per_day_report(14)},
        payment_methods=payment_methods_report(),
        operators=operators_report(),
    )
