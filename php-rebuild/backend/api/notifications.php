<?php
require __DIR__ . '/config.php';
require __DIR__ . '/notification_queue.php';

requireLogin('admin');

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    jsonResponse([
        'success' => true,
        'notifications' => notificationSummary($pdo),
    ]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
}

$data = readJsonBody();
if (($data['action'] ?? '') !== 'process') {
    jsonResponse(['success' => false, 'message' => 'Unknown action'], 400);
}

jsonResponse([
    'success' => true,
    'message' => 'Notification queue processed.',
    'result' => processNotificationQueue($pdo),
    'notifications' => notificationSummary($pdo),
]);
