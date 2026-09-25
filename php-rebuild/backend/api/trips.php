<?php
require __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $trips = $pdo->query(
        'SELECT t.*, r.origin, r.destination, r.price_ugx AS route_price, v.operator_name
         FROM trips t
         JOIN routes r ON r.id = t.route_id
         JOIN vehicles v ON v.id = t.vehicle_id
         WHERE DATE(t.departure_time) >= DATE("now", "localtime")
         ORDER BY t.departure_time ASC'
    )->fetchAll();

    jsonResponse(['success' => true, 'trips' => $trips]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
}

$data = json_decode(file_get_contents('php://input'), true);
if (!$data) {
    jsonResponse(['success' => false, 'message' => 'Invalid JSON payload'], 400);
}

$origin = trim((string)($data['origin'] ?? ''));
$destination = trim((string)($data['destination'] ?? ''));
$departureTime = trim((string)($data['departureTime'] ?? ''));
$arrivalTime = trim((string)($data['arrivalTime'] ?? ''));
$operator = trim((string)($data['operator'] ?? ''));
$price = (int)($data['price'] ?? 0);
$seatsAvailable = (int)($data['seatsAvailable'] ?? 0);

if ($origin === '' || $destination === '' || $departureTime === '' || $arrivalTime === '' || $operator === '' || $price <= 0 || $seatsAvailable <= 0) {
    jsonResponse(['success' => false, 'message' => 'Please complete all trip details'], 400);
}

$routeCheck = $pdo->prepare('SELECT id FROM routes WHERE origin = :origin AND destination = :destination LIMIT 1');
$routeCheck->execute([':origin' => $origin, ':destination' => $destination]);
$route = $routeCheck->fetch();

if (!$route) {
    $routeInsert = $pdo->prepare('INSERT INTO routes (origin, destination, distance_km, duration, price_ugx) VALUES (?, ?, 0, "0h 00m", ?)');
    $routeInsert->execute([$origin, $destination, $price]);
    $routeId = (int)$pdo->lastInsertId();
} else {
    $routeId = (int)$route['id'];
}

$vehicle = $pdo->query('SELECT id, total_seats FROM vehicles ORDER BY id ASC LIMIT 1')->fetch();
$vehicleId = $vehicle ? (int)$vehicle['id'] : 1;

$stmt = $pdo->prepare('INSERT INTO trips (route_id, vehicle_id, departure_time, arrival_time, price_ugx, available_seats, status) VALUES (?, ?, ?, ?, ?, ?, "SCHEDULED")');
$stmt->execute([$routeId, $vehicleId, $departureTime, $arrivalTime, $price, $seatsAvailable]);

jsonResponse([
    'success' => true,
    'message' => 'Trip added successfully',
    'trip' => [
        'origin' => $origin,
        'destination' => $destination,
        'departureTime' => $departureTime,
        'arrivalTime' => $arrivalTime,
        'operator' => $operator,
        'price' => $price,
        'seatsAvailable' => $seatsAvailable
    ]
]);
