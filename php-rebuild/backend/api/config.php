<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

$dbDir = __DIR__ . '/data';
if (!is_dir($dbDir)) {
    mkdir($dbDir, 0777, true);
}

$dbFile = $dbDir . '/bus_system.sqlite';
$pdo = new PDO('sqlite:' . $dbFile);
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

// Sessions remember who is logged in between requests
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

function readJsonBody()
{
    $data = json_decode(file_get_contents('php://input'), true);
    if (!is_array($data)) {
        jsonResponse(['success' => false, 'message' => 'Invalid JSON payload'], 400);
    }
    return $data;
}

function currentUser()
{
    return $_SESSION['user'] ?? null;
}

function requireLogin($role = null)
{
    $user = currentUser();
    if (!$user) {
        jsonResponse(['success' => false, 'message' => 'Please log in first'], 401);
    }
    if ($role && $user['role'] !== $role) {
        jsonResponse(['success' => false, 'message' => 'Not allowed'], 403);
    }
    return $user;
}

function jsonResponse($data, $status = 200)
{
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    exit;
}

function randomBookingRef()
{
    $letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    $code = $letters[rand(0, 25)] . $letters[rand(0, 25)] . '-' . rand(1000, 9999) . '-' . $letters[rand(0, 25)] . $letters[rand(0, 25)];
    return 'UG-' . $code;
}
