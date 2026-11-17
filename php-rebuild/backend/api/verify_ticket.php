<?php
// Staff portal: check a passenger's ticket at boarding.
//   POST {"ref": "UG-AB-1234-CD"} -> marks the ticket as used and returns the booking
//   GET                           -> the 20 most recent ticket checks (for the staff page)
// Staff and the admin may use it.
require __DIR__ . '/config.php';

$staff = requireAnyRole(['staff', 'admin']);

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $recent = $pdo->query("
        SELECT b.booking_ref, b.user_name, b.seats, b.verified_at, r.origin, r.destination, u.name AS verified_by_name
        FROM bookings b
        JOIN trips t ON t.id = b.trip_id
        JOIN routes r ON r.id = t.route_id
        LEFT JOIN users u ON u.id = b.verified_by
        WHERE b.verified_at IS NOT NULL
        ORDER BY b.verified_at DESC
        LIMIT 20
    ")->fetchAll();
    jsonResponse(['success' => true, 'recent' => $recent]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
}

$data = readJsonBody();
// Accept a plain reference, or the text inside the ticket QR code ("UGANDA-BUS|UG-AB-1234-CD|...")
$input = strtoupper(trim($data['ref'] ?? ''));
$parts = explode('|', $input);
$ref = $parts[0] === 'UGANDA-BUS' && isset($parts[1]) ? $parts[1] : $input;

if ($ref === '') {
    jsonResponse(['success' => false, 'message' => 'Enter a booking reference'], 400);
}

$stmt = $pdo->prepare('
    SELECT b.*, t.departure_time, t.arrival_time, r.origin, r.destination,
           v.reg_number, v.operator_name, u.name AS verified_by_name
    FROM bookings b
    JOIN trips t ON t.id = b.trip_id
    JOIN routes r ON r.id = t.route_id
    JOIN vehicles v ON v.id = t.vehicle_id
    LEFT JOIN users u ON u.id = b.verified_by
    WHERE b.booking_ref = ?
');
$stmt->execute([$ref]);
$booking = $stmt->fetch();

if (!$booking) {
    jsonResponse(['success' => false, 'result' => 'INVALID', 'message' => 'Invalid ticket: this booking reference does not exist.'], 404);
}

$booking['passenger_names'] = $booking['passenger_names'] ? json_decode($booking['passenger_names'], true) : [];
$booking['passenger_details'] = $booking['passenger_details'] ? json_decode($booking['passenger_details'], true) : [];

if ($booking['status'] === 'CANCELLED') {
    jsonResponse(['success' => false, 'result' => 'INVALID', 'message' => 'Invalid ticket: this booking was cancelled.', 'booking' => $booking], 400);
}

if ($booking['verified_at']) {
    jsonResponse([
        'success' => false,
        'result' => 'USED',
        'message' => 'Already used: this ticket was checked at ' . $booking['verified_at'] . ' by ' . ($booking['verified_by_name'] ?: 'staff') . '.',
        'booking' => $booking
    ], 409);
}

if (substr($booking['departure_time'], 0, 10) < date('Y-m-d')) {
    jsonResponse(['success' => false, 'result' => 'EXPIRED', 'message' => 'Expired ticket: this trip departed on ' . substr($booking['departure_time'], 0, 10) . '.', 'booking' => $booking], 400);
}

$verifiedAt = date('Y-m-d H:i:s');
$mark = $pdo->prepare('UPDATE bookings SET verified_at = ?, verified_by = ? WHERE id = ? AND verified_at IS NULL');
$mark->execute([$verifiedAt, $staff['id'] ?: null, $booking['id']]);
// Two conductors scanning the same ticket at once: only the first update changes a row
if ($mark->rowCount() === 0) {
    jsonResponse(['success' => false, 'result' => 'USED', 'message' => 'Already used: this ticket was just checked by someone else.', 'booking' => $booking], 409);
}
$booking['verified_at'] = $verifiedAt;
$booking['verified_by_name'] = $staff['name'];

$message = 'Valid ticket: boarding approved.';
if ($booking['payment_status'] === 'PAY_AT_STATION') {
    $message .= ' Collect UGX ' . number_format($booking['total_amount']) . ' in cash before boarding.';
}

jsonResponse(['success' => true, 'result' => 'VALID', 'message' => $message, 'booking' => $booking]);
