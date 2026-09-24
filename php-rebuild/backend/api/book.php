<?php
require __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
}

$user = requireLogin('customer');
$data = readJsonBody();

$blocked = $pdo->prepare('SELECT blocked FROM users WHERE id = ?');
$blocked->execute([$user['id']]);
$blockedFlag = $blocked->fetchColumn();
if ($blockedFlag === false) {
    session_destroy();
    jsonResponse(['success' => false, 'message' => 'Please log in again.'], 401);
}
if ((int)$blockedFlag === 1) {
    jsonResponse(['success' => false, 'message' => 'This account has been suspended. Please contact Uganda Bus support.'], 403);
}

$tripId = (int)($data['tripId'] ?? 0);
$customerName = trim($data['customerName'] ?? '');
$phone = trim($data['phone'] ?? '');
$email = trim($data['email'] ?? '');
$paymentMethod = trim($data['paymentMethod'] ?? 'MTN_MOMO');
$seats = array_values(array_unique(array_filter((array)($data['seats'] ?? []))));

if ($tripId <= 0 || $customerName === '' || $phone === '' || $email === '' || count($seats) === 0) {
    jsonResponse(['success' => false, 'message' => 'Please complete all booking details'], 400);
}

$allowedPayments = ['MTN_MOMO', 'AIRTEL_MONEY', 'VISA_CARD', 'CASH_AT_STATION'];
if (!in_array($paymentMethod, $allowedPayments)) {
    jsonResponse(['success' => false, 'message' => 'Invalid payment method'], 400);
}

// Do everything in one transaction so two people cannot grab the same seat
$pdo->beginTransaction();

$stmt = $pdo->prepare('SELECT * FROM trips WHERE id = :id');
$stmt->execute([':id' => $tripId]);
$trip = $stmt->fetch();

if (!$trip || $trip['status'] !== 'SCHEDULED') {
    $pdo->rollBack();
    jsonResponse(['success' => false, 'message' => 'This trip is no longer available'], 404);
}

if ($trip['available_seats'] < count($seats)) {
    $pdo->rollBack();
    jsonResponse(['success' => false, 'message' => 'Not enough seats left on this trip'], 400);
}

$taken = [];
$seatsStmt = $pdo->prepare("SELECT seats FROM bookings WHERE trip_id = ? AND status = 'CONFIRMED'");
$seatsStmt->execute([$tripId]);
foreach ($seatsStmt->fetchAll() as $row) {
    $taken = array_merge($taken, explode(',', $row['seats']));
}
$clash = array_intersect($seats, $taken);
if ($clash) {
    $pdo->rollBack();
    jsonResponse(['success' => false, 'message' => 'Seat(s) ' . implode(', ', $clash) . ' were just booked by someone else. Please choose again.'], 409);
}

$bookingRef = randomBookingRef();
$total = (int)$trip['price_ugx'] * count($seats);
$paymentStatus = $paymentMethod === 'CASH_AT_STATION' ? 'PAY_AT_STATION' : 'PAID';

$insert = $pdo->prepare('INSERT INTO bookings (booking_ref, user_id, user_name, phone, email, trip_id, seats, total_amount, payment_method, payment_status, paid_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
$insert->execute([
    $bookingRef,
    $user['id'],
    $customerName,
    $phone,
    $email,
    $tripId,
    implode(',', $seats),
    $total,
    $paymentMethod,
    $paymentStatus,
    $paymentStatus === 'PAID' ? gmdate('Y-m-d H:i:s') : null
]);

$update = $pdo->prepare('UPDATE trips SET available_seats = available_seats - :count WHERE id = :id');
$update->execute([':count' => count($seats), ':id' => $tripId]);

$pdo->commit();

jsonResponse([
    'success' => true,
    'message' => 'Booking confirmed successfully',
    'bookingRef' => $bookingRef,
    'total' => $total,
    'seats' => $seats,
    'tripId' => $tripId
]);
