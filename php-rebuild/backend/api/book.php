<?php
require __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
}

$data = json_decode(file_get_contents('php://input'), true);

if (!$data) {
    jsonResponse(['success' => false, 'message' => 'Invalid JSON payload'], 400);
}

$tripId = (int)($data['tripId'] ?? 0);
$customerName = trim($data['customerName'] ?? '');
$phone = trim($data['phone'] ?? '');
$email = trim($data['email'] ?? '');
$paymentMethod = trim($data['paymentMethod'] ?? 'MTN_MOMO');
$seats = $data['seats'] ?? [];

if ($tripId <= 0 || $customerName === '' || $phone === '' || $email === '' || count($seats) === 0) {
    jsonResponse(['success' => false, 'message' => 'Please complete all booking details'], 400);
}

$stmt = $pdo->prepare('SELECT * FROM trips WHERE id = :id');
$stmt->execute([':id' => $tripId]);
$trip = $stmt->fetch();

if (!$trip) {
    jsonResponse(['success' => false, 'message' => 'Trip not found'], 404);
}

if ($trip['available_seats'] < count($seats)) {
    jsonResponse(['success' => false, 'message' => 'Selected seats are no longer available'], 400);
}

$bookingRef = randomBookingRef();
$total = (int)$trip['price_ugx'] * count($seats);

$insert = $pdo->prepare('INSERT INTO bookings (booking_ref, user_name, phone, email, trip_id, seats, total_amount, payment_method, payment_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, "PAID")');
$insert->execute([
    $bookingRef,
    $customerName,
    $phone,
    $email,
    $tripId,
    implode(',', $seats),
    $total,
    $paymentMethod
]);

$updatedSeats = $trip['available_seats'] - count($seats);
$update = $pdo->prepare('UPDATE trips SET available_seats = :available WHERE id = :id');
$update->execute([':available' => $updatedSeats, ':id' => $tripId]);

jsonResponse([
    'success' => true,
    'message' => 'Booking confirmed successfully',
    'bookingRef' => $bookingRef,
    'total' => $total,
    'seats' => $seats,
    'tripId' => $tripId
]);
