<?php
// A customer cancels one of their own bookings before departure.
//   POST {"ref": "UG-AB-1234-CD"}
// Seats go back on sale. A paid booking is marked REFUNDED (the refund itself is simulated).
require __DIR__ . '/config.php';
require __DIR__ . '/notification_queue.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
}

$user = requireLogin('customer');
$data = readJsonBody();
$ref = trim($data['ref'] ?? '');

if ($ref === '') {
    jsonResponse(['success' => false, 'message' => 'Booking reference is required'], 400);
}

// Serialize cancellation with bookings so a released seat cannot race a new
// reservation while availability is being updated.
$pdo->exec('BEGIN IMMEDIATE TRANSACTION');
// The transaction was started with SQL, so it must also end with SQL (COMMIT / ROLLBACK).
// PDO's commit()/rollBack() only know about transactions opened with beginTransaction()
// and would throw "There is no active transaction", losing the change.

$stmt = $pdo->prepare('
    SELECT b.*, t.departure_time
    FROM bookings b
    JOIN trips t ON t.id = b.trip_id
    WHERE b.booking_ref = ?
');
$stmt->execute([$ref]);
$booking = $stmt->fetch();

function cancelFail($message, $status)
{
    global $pdo;
    $pdo->exec('ROLLBACK');
    jsonResponse(['success' => false, 'message' => $message], $status);
}

// Same answer for "not yours" and "does not exist", so references cannot be probed
if (!$booking || (int)$booking['user_id'] !== $user['id']) {
    cancelFail('Booking not found', 404);
}
if ($booking['status'] !== 'CONFIRMED') {
    cancelFail('This booking is already cancelled', 400);
}
if ($booking['verified_at']) {
    cancelFail('This ticket has already been used for boarding', 400);
}
if ($booking['departure_time'] <= date('Y-m-d H:i:s')) {
    cancelFail('This bus has already departed, so the booking cannot be cancelled', 400);
}

$seatCount = count(array_filter(explode(',', $booking['seats'])));
$wasPaid = $booking['payment_status'] === 'PAID';

$pdo->prepare("UPDATE bookings SET status = 'CANCELLED' WHERE id = ?")->execute([$booking['id']]);
if ($wasPaid) {
    $pdo->prepare("UPDATE bookings SET payment_status = 'REFUNDED', refunded_at = ? WHERE id = ?")
        ->execute([gmdate('Y-m-d H:i:s'), $booking['id']]);
}
$pdo->prepare('UPDATE trips SET available_seats = available_seats + ? WHERE id = ?')
    ->execute([$seatCount, $booking['trip_id']]);

enqueueNotification($pdo, $ref, $booking['email'], $booking['user_name'], 'EMAIL', 'BOOKING_CANCELLED', [
    'subject' => 'Your Uganda Bus booking was cancelled',
    'seatsReleased' => $seatCount,
    'refundStarted' => $wasPaid,
    'message' => "Booking $ref was cancelled.",
]);

$pdo->exec('COMMIT');

jsonResponse([
    'success' => true,
    'message' => $wasPaid
        ? "Booking $ref cancelled. Your refund of UGX " . number_format($booking['total_amount']) . ' has been started.'
        : "Booking $ref cancelled."
]);
