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

// Checkout may send one entry per seat: {seat, fullName, phone, email}.
// The first traveller is also stored as the main contact for the booking.
$passengerDetails = [];
foreach ((array)($data['passengerDetails'] ?? []) as $i => $p) {
    $traveller = [
        'seat' => trim((string)($p['seat'] ?? '')),
        'name' => trim((string)($p['fullName'] ?? '')),
        'phone' => preg_replace('/[\s-]/', '', trim((string)($p['phone'] ?? ''))),
        'email' => strtolower(trim((string)($p['email'] ?? '')))
    ];
    $n = $i + 1;
    if ($traveller['seat'] === '') {
        jsonResponse(['success' => false, 'message' => "Passenger #$n has no seat"], 400);
    }
    if (!preg_match("/^[A-Za-z][A-Za-z\\s'.-]*$/", $traveller['name'])) {
        jsonResponse(['success' => false, 'message' => "Passenger #$n has an invalid name. Only letters, spaces and hyphens are allowed."], 400);
    }
    if (!isUgandanPhone($traveller['phone'])) {
        jsonResponse(['success' => false, 'message' => "Passenger #$n phone number must be a valid Ugandan number (e.g. 0771234567 or +256771234567)."], 400);
    }
    if (!filter_var($traveller['email'], FILTER_VALIDATE_EMAIL)) {
        jsonResponse(['success' => false, 'message' => "Passenger #$n email address is invalid."], 400);
    }
    $passengerDetails[] = $traveller;
}
if ($passengerDetails) {
    $data['seats'] = array_column($passengerDetails, 'seat');
    $data['passengerNames'] = array_column($passengerDetails, 'name');
    $data['customerName'] = $data['customerName'] ?? $passengerDetails[0]['name'];
    $data['phone'] = $data['phone'] ?? $passengerDetails[0]['phone'];
    $data['email'] = $data['email'] ?? $passengerDetails[0]['email'];
}

$tripId = (int)($data['tripId'] ?? 0);
$customerName = trim($data['customerName'] ?? '');
$phone = trim($data['phone'] ?? '');
$email = trim($data['email'] ?? '');
$paymentMethod = trim($data['paymentMethod'] ?? 'MTN_MOMO');
$seats = array_values(array_unique(array_filter((array)($data['seats'] ?? []))));

// Optional: one traveller name per seat (same order as the seats)
$passengerNames = array_map(fn($n) => trim((string)$n), (array)($data['passengerNames'] ?? []));

if ($tripId <= 0 || $customerName === '' || $phone === '' || $email === '' || count($seats) === 0) {
    jsonResponse(['success' => false, 'message' => 'Please complete all booking details'], 400);
}

if ($passengerNames) {
    if (count($passengerNames) !== count($seats)) {
        jsonResponse(['success' => false, 'message' => 'Please enter one traveller name for each seat'], 400);
    }
    foreach ($passengerNames as $i => $travellerName) {
        if (!preg_match("/^[A-Za-z][A-Za-z\\s'.-]*$/", $travellerName)) {
            jsonResponse(['success' => false, 'message' => 'Traveller name for seat ' . $seats[$i] . ' should contain letters only'], 400);
        }
    }
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

$insert = $pdo->prepare('INSERT INTO bookings (booking_ref, user_id, user_name, phone, email, trip_id, seats, passenger_names, passenger_details, total_amount, payment_method, payment_status, paid_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
$insert->execute([
    $bookingRef,
    $user['id'],
    $customerName,
    $phone,
    $email,
    $tripId,
    implode(',', $seats),
    $passengerNames ? json_encode($passengerNames) : null,
    $passengerDetails ? json_encode($passengerDetails) : null,
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
