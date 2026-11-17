<?php
// Customer dashboard: every booking made by the logged-in customer
//   GET -> { bookings: [...], summary: { total, upcoming, spent } }
require __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
}

$user = requireLogin('customer');

$stmt = $pdo->prepare("
    SELECT b.booking_ref, b.trip_id, b.user_name, b.phone, b.email, b.seats, b.passenger_names, b.passenger_details, b.total_amount,
           b.payment_method, b.payment_status, b.status, b.created_at, b.verified_at,
           t.departure_time, t.arrival_time, t.price_ugx, t.status AS trip_status,
           r.origin, r.destination, r.distance_km, r.duration, v.operator_name, v.reg_number, v.model
    FROM bookings b
    JOIN trips t ON t.id = b.trip_id
    JOIN routes r ON r.id = t.route_id
    JOIN vehicles v ON v.id = t.vehicle_id
    WHERE b.user_id = ?
    ORDER BY t.departure_time DESC
");
$stmt->execute([$user['id']]);
$bookings = $stmt->fetchAll();

$now = date('Y-m-d H:i:s');
$upcoming = 0;
$spent = 0;
foreach ($bookings as &$booking) {
    $booking['passenger_names'] = $booking['passenger_names'] ? json_decode($booking['passenger_names'], true) : [];
    $booking['passenger_details'] = $booking['passenger_details'] ? json_decode($booking['passenger_details'], true) : [];
    // A booking can be cancelled by the customer until the bus leaves
    $booking['can_cancel'] = $booking['status'] === 'CONFIRMED'
        && $booking['departure_time'] > $now
        && !$booking['verified_at'];
    if ($booking['status'] === 'CONFIRMED' && $booking['departure_time'] > $now) {
        $upcoming++;
    }
    if ($booking['payment_status'] === 'PAID') {
        $spent += (int)$booking['total_amount'];
    }
}
unset($booking);

jsonResponse([
    'success' => true,
    'bookings' => $bookings,
    'summary' => ['total' => count($bookings), 'upcoming' => $upcoming, 'spent' => $spent]
]);
