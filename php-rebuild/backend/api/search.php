<?php
require __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
}

$origin = trim($_GET['origin'] ?? '');
$destination = trim($_GET['destination'] ?? '');
$date = trim($_GET['date'] ?? '');
$passengers = (int)($_GET['passengers'] ?? 1);

$limit = (int)($_GET['limit'] ?? 0);

// Origin and destination are optional: with none, all upcoming trips are listed (home page)
if ($origin !== '' && strtolower($origin) === strtolower($destination)) {
    jsonResponse(['success' => false, 'message' => 'Origin and destination cannot be the same'], 400);
}

$sql = "
    SELECT t.*, r.origin, r.destination, r.distance_km, r.duration, r.price_ugx AS route_price,
           v.id AS vehicle_id, v.reg_number, v.model, v.total_seats, v.operator_name, v.driver_name
    FROM trips t
    JOIN routes r ON r.id = t.route_id
    JOIN vehicles v ON v.id = t.vehicle_id
    WHERE t.available_seats >= :passengers
      AND t.status = 'SCHEDULED'
      AND r.status = 'ACTIVE'
      AND DATE(t.departure_time) >= DATE('now', 'localtime')
";

$params = [':passengers' => $passengers];

if ($origin !== '') {
    $sql .= ' AND r.origin = :origin ';
    $params[':origin'] = $origin;
}

if ($destination !== '') {
    $sql .= ' AND r.destination = :destination ';
    $params[':destination'] = $destination;
}

if ($date !== '') {
    $sql .= " AND DATE(t.departure_time) = :date ";
    $params[':date'] = $date;
}

if ($date === '') {
    $sql .= " AND t.departure_time >= DATETIME('now', 'localtime') ";
}

$sql .= ' ORDER BY t.departure_time ASC';

if ($limit > 0) {
    $sql .= ' LIMIT ' . $limit;
}

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$trips = $stmt->fetchAll();

jsonResponse([
    'success' => true,
    'count' => count($trips),
    'trips' => $trips
]);
