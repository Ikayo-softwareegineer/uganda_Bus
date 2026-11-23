<?php
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$documentRoot = __DIR__;
$file = realpath($documentRoot . $path);

if ($file !== false
    && str_starts_with($file, $documentRoot . DIRECTORY_SEPARATOR)
    && is_file($file)
    && preg_match('/\.(?:sqlite3?|db|db-journal|db-wal|db-shm)$/i', $file)
) {
    http_response_code(404);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'message' => 'Not found']);
    return true;
}

if ($path !== '/' && $file !== false && is_file($file)) {
    return false;
}

require $documentRoot . '/index.html';
