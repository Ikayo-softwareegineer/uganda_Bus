<?php
require __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
}

$origin = trim($_GET['origin'] ?? '');
$destination = trim($_GET['destination'] ?? '');
$date = trim($_GET['date'] ?? '');
$passengers = (int)($_GET['passengers'] ?? 1);

if ($origin === '' || $destination === '') {
    jsonResponse(['success' => false, 'message' => 'Origin and destination are required'], 400);
}

if (strtolower($origin) === strtolower($destination)) {
    jsonResponse(['success' => false, 'message' => 'Origin and destination cannot be the same'], 400);
}

$sql = "
    SELECT t.*, r.origin, r.destination, r.distance_km, r.duration, r.price_ugx AS route_price,
           v.id AS vehicle_id, v.reg_number, v.model, v.total_seats, v.operator_name, v.driver_name
    FROM trips t
    JOIN routes r ON r.id = t.route_id
    JOIN vehicles v ON v.id = t.vehicle_id
    WHERE r.origin = :origin
      AND r.destination = :destination
      AND t.available_seats >= :passengers
";

$params = [
    ':origin' => $origin,
    ':destination' => $destination,
    ':passengers' => $passengers
];

if ($date !== '') {
    $sql .= " AND DATE(t.departure_time) = :date ";
    $params[':date'] = $date;
}

$sql .= ' ORDER BY t.departure_time ASC';

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$trips = $stmt->fetchAll();

jsonResponse([
    'success' => true,
    'count' => count($trips),
    'trips' => $trips
]);
