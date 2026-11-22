<?php

/**
 * UG Express - Concurrency Engine
 * -----------------------------------
 * Demonstrates real concurrent HTTP requests,
 * shared-resource contention and mutual exclusion.
 *
 * This is an isolated laboratory.
 * It DOES NOT modify real bus bookings.
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

// --------------------------------------------------
// 1. Enable the lab only when explicitly configured
// --------------------------------------------------

$enabled = getenv('CONCURRENCY_LAB_ENABLED');

if ($enabled !== 'true') {
    http_response_code(503);

    echo json_encode([
        'success' => false,
        'message' => 'Concurrency laboratory is disabled.'
    ]);

    exit;
}

// --------------------------------------------------
// 2. Accept POST requests only
// --------------------------------------------------

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);

    echo json_encode([
        'success' => false,
        'message' => 'Only POST requests are allowed.'
    ]);

    exit;
}

// --------------------------------------------------
// 3. Read JSON input
// --------------------------------------------------

$input = json_decode(
    file_get_contents('php://input'),
    true
);

if (!is_array($input)) {
    http_response_code(400);

    echo json_encode([
        'success' => false,
        'message' => 'Invalid JSON request.'
    ]);

    exit;
}

$action = $input['action'] ?? '';
$clientId = trim((string)($input['clientId'] ?? ''));

// --------------------------------------------------
// 4. Validate action
// --------------------------------------------------

if (!in_array($action, ['reset', 'claim'], true)) {
    http_response_code(400);

    echo json_encode([
        'success' => false,
        'message' => 'Unknown laboratory action.'
    ]);

    exit;
}

if ($action === 'claim') {
    if ($clientId === '' || strlen($clientId) > 50) {
        http_response_code(400);

        echo json_encode([
            'success' => false,
            'message' => 'A valid client ID is required.'
        ]);

        exit;
    }
}

// --------------------------------------------------
// 5. Shared laboratory storage
// --------------------------------------------------

// This file stores the state of our shared resource.
// It is separate from the bus booking database.

$stateFile = sys_get_temp_dir() . '/ugexpress_concurrency_lab.json';

$file = fopen($stateFile, 'c+');

if (!$file) {
    http_response_code(500);

    echo json_encode([
        'success' => false,
        'message' => 'Unable to open laboratory storage.'
    ]);

    exit;
}

// --------------------------------------------------
// 6. Critical section: acquire exclusive lock
// --------------------------------------------------

if (!flock($file, LOCK_EX)) {
    fclose($file);

    http_response_code(500);

    echo json_encode([
        'success' => false,
        'message' => 'Unable to acquire resource lock.'
    ]);

    exit;
}

// From this point, another request cannot enter
// this locked section until we release the lock.

$contents = stream_get_contents($file);

$state = json_decode($contents ?: '', true);

if (!is_array($state)) {
    $state = [
        'resource_taken' => false,
        'winner' => null,
        'attempts' => 0
    ];
}

// --------------------------------------------------
// 7. Reset experiment
// --------------------------------------------------

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

    echo json_encode([
        'success' => true,
        'message' => 'Concurrency laboratory reset successfully.',
        'state' => $state
    ]);

    exit;
}

// --------------------------------------------------
// 8. Resource competition
// --------------------------------------------------

$state['attempts']++;

if ($state['resource_taken'] === false) {

    // First client entering the critical section wins.
    $state['resource_taken'] = true;
    $state['winner'] = $clientId;

    $success = true;
    $message = 'Resource successfully acquired.';

    $httpCode = 200;

} else {

    // Other clients are rejected because the resource
    // has already been acquired by another client.

    $success = false;
    $message = 'Resource is already occupied by another client.';

    $httpCode = 409;
}

// --------------------------------------------------
// 9. Save shared state before releasing the lock
// --------------------------------------------------

ftruncate($file, 0);
rewind($file);

fwrite($file, json_encode($state));
fflush($file);

// --------------------------------------------------
// 10. Release the lock
// --------------------------------------------------

flock($file, LOCK_UN);
fclose($file);

// --------------------------------------------------
// 11. Send the HTTP response
// --------------------------------------------------

http_response_code($httpCode);

echo json_encode([
    'success' => $success,
    'clientId' => $clientId,
    'message' => $message,
    'winner' => $state['winner'],
    'attempts' => $state['attempts']
]);

exit;
