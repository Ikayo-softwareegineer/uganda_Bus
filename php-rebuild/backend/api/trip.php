<?php
require __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
}

$id = (int)($_GET['id'] ?? 0);

$stmt = $pdo->prepare('
    SELECT t.*, r.origin, r.destination, r.distance_km, r.duration,
           v.reg_number, v.model, v.total_seats, v.operator_name, v.driver_name
    FROM trips t
    JOIN routes r ON r.id = t.route_id
    JOIN vehicles v ON v.id = t.vehicle_id
    WHERE t.id = ?
');
$stmt->execute([$id]);
$trip = $stmt->fetch();

if (!$trip) {
    jsonResponse(['success' => false, 'message' => 'Trip not found'], 404);
}

// Collect every seat already booked on this trip, e.g. ["1A", "2C"]
$seatsStmt = $pdo->prepare('SELECT seats FROM bookings WHERE trip_id = ?');
$seatsStmt->execute([$id]);
$bookedSeats = [];
foreach ($seatsStmt->fetchAll() as $row) {
    $bookedSeats = array_merge($bookedSeats, array_filter(explode(',', $row['seats'])));
}

$trip['booked_seats'] = array_values(array_unique($bookedSeats));

jsonResponse(['success' => true, 'trip' => $trip]);
