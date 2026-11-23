<?php
// Admin reports, worked out by the separate Python/Flask reports service.
//   GET reports.php?type=all&days=7
//
// The browser never talks to Flask directly:
//   admin.html --> reports.php (checks the admin login) --> Flask service --> SQLite (read-only)
//
// Settings (environment variables):
//   REPORTS_SERVICE_URL  where Flask listens   (default http://127.0.0.1:5001)
//   REPORTS_SERVICE_KEY  shared secret, must match the Flask .env (default dev-reports-key)
require __DIR__ . '/config.php';

requireLogin('admin');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
}

// Only these reports can be asked for, so the URL sent to Flask is always one we built
$reports = [
    'all' => '/reports/all',
    'summary' => '/reports/summary',
    'revenue-by-route' => '/reports/revenue-by-route',
    'occupancy' => '/reports/occupancy',
    'bookings-per-day' => '/reports/bookings-per-day',
    'payment-methods' => '/reports/payment-methods',
    'operators' => '/reports/operators',
];

$type = $_GET['type'] ?? 'all';
if (!isset($reports[$type])) {
    jsonResponse(['success' => false, 'message' => 'Unknown report type'], 400);
}

$query = '';
if (isset($_GET['days'])) {
    $days = (int)$_GET['days'];
    if ($days < 1 || $days > 90) {
        jsonResponse(['success' => false, 'message' => 'days must be from 1 to 90'], 400);
    }
    $query = '?days=' . $days;
}

$baseUrl = rtrim(getenv('REPORTS_SERVICE_URL') ?: 'http://127.0.0.1:5001', '/');
$serviceKey = getenv('REPORTS_SERVICE_KEY') ?: 'dev-reports-key';

// Plain PHP HTTP request (no extra extension needed). A short timeout means a
// stopped Flask service makes the admin page wait 3 seconds at most.
$context = stream_context_create([
    'http' => [
        'method' => 'GET',
        'header' => "X-Service-Key: $serviceKey\r\nAccept: application/json\r\n",
        'timeout' => 3,
        'ignore_errors' => true, // still read the body when Flask answers 4xx/5xx
    ],
]);

$started = microtime(true);
$body = @file_get_contents($baseUrl . $reports[$type] . $query, false, $context);
$elapsedMs = (int)round((microtime(true) - $started) * 1000);

if ($body === false) {
    // Flask is not running or cannot be reached (an RPC failure, as in the lectures)
    jsonResponse([
        'success' => false,
        'service' => 'offline',
        'message' => 'The reports service is not running. Start it with: python app.py (in services/reports-service).'
    ], 503);
}

// $http_response_header is filled in by file_get_contents: "HTTP/1.1 200 OK", ...
$status = 502;
if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0] . ' ', $m)) {
    $status = (int)$m[1];
}

$data = json_decode($body, true);
if (!is_array($data)) {
    jsonResponse(['success' => false, 'service' => 'error', 'message' => 'The reports service sent an unexpected answer.'], 502);
}

if ($status === 401) {
    // Wrong key: a setup problem on our side, not the admin's fault
    jsonResponse([
        'success' => false,
        'service' => 'misconfigured',
        'message' => 'The reports service refused the key. REPORTS_SERVICE_KEY must be the same for PHP and Flask.'
    ], 502);
}

$data['service'] = $status < 400 ? 'online' : 'error';
$data['responseTimeMs'] = $elapsedMs;
jsonResponse($data, $status);
