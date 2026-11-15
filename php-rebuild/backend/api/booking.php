<?php
require __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
}

$user = requireLogin();
$ref = trim($_GET['ref'] ?? '');

$stmt = $pdo->prepare('
    SELECT b.*, t.departure_time, t.arrival_time, t.price_ugx, r.origin, r.destination,
           r.distance_km, r.duration, v.operator_name, v.reg_number, v.model
    FROM bookings b
    JOIN trips t ON t.id = b.trip_id
    JOIN routes r ON r.id = t.route_id
    JOIN vehicles v ON v.id = t.vehicle_id
    WHERE b.booking_ref = ?
');
$stmt->execute([$ref]);
$booking = $stmt->fetch();

// Customers may only view their own bookings; the admin may view all
if (!$booking || ($user['role'] !== 'admin' && (int)$booking['user_id'] !== $user['id'])) {
    jsonResponse(['success' => false, 'message' => 'Booking not found'], 404);
}

jsonResponse(['success' => true, 'booking' => $booking]);
