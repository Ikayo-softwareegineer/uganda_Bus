<?php
require __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
}

$stats = [
    ['label' => 'Trips', 'value' => (int)$pdo->query('SELECT COUNT(*) FROM trips')->fetchColumn()],
    ['label' => 'Routes', 'value' => (int)$pdo->query('SELECT COUNT(*) FROM routes')->fetchColumn()],
    ['label' => 'Vehicles', 'value' => (int)$pdo->query('SELECT COUNT(*) FROM vehicles')->fetchColumn()],
    ['label' => 'Bookings', 'value' => (int)$pdo->query('SELECT COUNT(*) FROM bookings')->fetchColumn()]
];

jsonResponse(['success' => true, 'stats' => $stats]);
