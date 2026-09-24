<?php
require __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
}

$routes = $pdo->query('SELECT * FROM routes ORDER BY origin ASC, destination ASC')->fetchAll();
$origins = array_values(array_unique(array_map(fn($r) => $r['origin'], $routes)));
$destinations = array_values(array_unique(array_map(fn($r) => $r['destination'], $routes)));

jsonResponse([
    'success' => true,
    'routes' => $routes,
    'origins' => $origins,
    'destinations' => $destinations
]);
