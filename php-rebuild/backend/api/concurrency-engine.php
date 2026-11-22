<?php

/**
 * UG Express - Concurrency Engine
 * Real HTTP concurrency + mutual exclusion experiment.
 * Isolated from the real bus booking system.
 */

require __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

// 1. POST requests only
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse([
        'success' => false,
        'message' => 'Only POST requests are allowed.'
    ], 405);
}

// 2. Require an administrator
$user = requireLogin('admin');

// 3. Lab disabled by default
if (getenv('CONCURRENCY_LAB_ENABLED') !== 'true') {
    jsonResponse([
        'success' => false,
        'message' => 'Concurrency laboratory is disabled.'
    ], 503);
}

// 4. Read request data
$input = json_decode(file_get_contents('php://input'), true);

if (!is_array($input)) {
    jsonResponse([
        'success' => false,
        'message' => 'Invalid JSON request.'
    ], 400);
}

$action = $input['action'] ?? '';
$clientId = trim((string)($input['clientId'] ?? ''));

if (!in_array($action, ['reset', 'claim'], true)) {
    jsonResponse([
        'success' => false,
        'message' => 'Unknown laboratory action.'
    ], 400);
}

if ($action === 'claim' && ($clientId === '' || strlen($clientId) > 50)) {
    jsonResponse([
        'success' => false,
        'message' => 'A valid client ID is required.'
    ], 400);
}

// 5. Separate lab state file
$stateFile = sys_get_temp_dir() . '/ugexpress_concurrency_lab.json';

$file = fopen($stateFile, 'c+');

if (!$file) {
    jsonResponse([
        'success' => false,
        'message' => 'Unable to open laboratory storage.'
    ], 500);
}

// 6. Acquire exclusive lock
if (!flock($file, LOCK_EX)) {
    fclose($file);

    jsonResponse([
        'success' => false,
        'message' => 'Unable to acquire resource lock.'
    ], 500);
}

// CRITICAL SECTION STARTS
// Only one request at a time can access this locked state.

rewind($file);
$contents = stream_get_contents($file);
$state = json_decode($contents ?: '', true);

if (!is_array($state)) {
    $state = [
        'resource_taken' => false,
        'winner' => null,
        'attempts' => 0
    ];
}

// 7. Reset the experiment
if ($action === 'reset') {

    $state = [
        'resource_taken' => false,
        'winner' => null,
        'attempts' => 0
    ];

    ftruncate($file, 0);
    rewind($file);
    fwrite($file, json_encode($state));
    fflush($file);

    flock($file, LOCK_UN);
    fclose($file);

    jsonResponse([
        'success' => true,
        'message' => 'Lab reset successfully.',
        'state' => $state
    ]);
}

// 8. Simulate resource competition
$state['attempts']++;

if ($state['resource_taken'] === false) {

    // The first request inside the critical section wins
    $state['resource_taken'] = true;
    $state['winner'] = $clientId;

    $success = true;
    $message = 'Resource acquired successfully.';
    $httpCode = 200;

} else {

    // Resource has already been claimed
    $success = false;
    $message = 'Resource already acquired by another client.';
    $httpCode = 409;
}

// 9. Persist state while lock is still held
ftruncate($file, 0);
rewind($file);
fwrite($file, json_encode($state));
fflush($file);

// CRITICAL SECTION ENDS
flock($file, LOCK_UN);
fclose($file);

// 10. Send result
http_response_code($httpCode);

echo json_encode([
    'success' => $success,
    'clientId' => $clientId,
    'message' => $message,
    'winner' => $state['winner'],
    'attempts' => $state['attempts']
]);

exit;
