<?php
error_reporting(E_ALL);

function jsonResponse($data, $status = 200)
{
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    exit;
}

if (!class_exists('PDO') || !in_array('sqlite', PDO::getAvailableDrivers(), true)) {
    jsonResponse([
        'success' => false,
        'message' => 'The PHP SQLite database driver is not enabled. Install php-pdo and php-sqlite, then restart the PHP server.'
    ], 503);
}

$dbDir = __DIR__ . '/data';
if (!is_dir($dbDir)) {
    mkdir($dbDir, 0777, true);
}

$dbFile = $dbDir . '/bus_system.sqlite';
$pdo = new PDO('sqlite:' . $dbFile);
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

function randomBookingRef()
{
    $letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    $code = $letters[rand(0, 25)] . $letters[rand(0, 25)] . '-' . rand(1000, 9999) . '-' . $letters[rand(0, 25)] . $letters[rand(0, 25)];
    return 'UG-' . $code;
}
