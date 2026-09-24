<?php
require __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
}

requireLogin('admin');

$stats = [
    'trips' => (int)$pdo->query('SELECT COUNT(*) FROM trips')->fetchColumn(),
    'bookings' => (int)$pdo->query('SELECT COUNT(*) FROM bookings')->fetchColumn(),
    'revenue' => (int)$pdo->query('SELECT COALESCE(SUM(total_amount), 0) FROM bookings')->fetchColumn(),
    'routes' => (int)$pdo->query('SELECT COUNT(*) FROM routes')->fetchColumn()
];

$bookings = $pdo->query('
    SELECT b.booking_ref, b.seats, b.total_amount, b.user_name, b.created_at, r.origin, r.destination
    FROM bookings b
    JOIN trips t ON t.id = b.trip_id
    JOIN routes r ON r.id = t.route_id
    ORDER BY b.id DESC
    LIMIT 50
')->fetchAll();

jsonResponse(['success' => true, 'stats' => $stats, 'bookings' => $bookings]);
