<?php
error_reporting(E_ALL);
// Warnings printed into the response would break the JSON the pages expect
ini_set('display_errors', 0);
ini_set('log_errors', 1);

// Keep the administrator password in the server environment, not source control.
const ADMIN_EMAIL = 'admin@ugbus.com';
define('ADMIN_PASSWORD', getenv('ADMIN_PASSWORD') ?: '');

// Bump this when schema.php changes so existing databases are upgraded
const SCHEMA_VERSION = 4;

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
$pdo->exec('PRAGMA busy_timeout = 5000');

// Create or upgrade the database automatically on first use
require_once __DIR__ . '/schema.php';
$schemaVersion = (int)$pdo->query('PRAGMA user_version')->fetchColumn();
if ($schemaVersion < SCHEMA_VERSION) {
    initDatabase($pdo);
    if ($schemaVersion < 4) {
        removeLegacyDemoData($pdo);
    }
    refreshAdminStats($pdo);
    $pdo->exec('PRAGMA user_version = ' . SCHEMA_VERSION);
}

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

// Like requireLogin(), but any of several roles may pass, e.g. ['staff', 'admin']
function requireAnyRole(array $roles)
{
    $user = requireLogin();
    if (!in_array($user['role'], $roles, true)) {
        jsonResponse(['success' => false, 'message' => 'Not allowed'], 403);
    }
    return $user;
}

// Same rule on every form that takes a phone number: 07XXXXXXXX or +2567XXXXXXXX
function isUgandanPhone($phone)
{
    return (bool)preg_match('/^(\+256|0)7\d{8}$/', preg_replace('/[\s-]/', '', (string)$phone));
}

function randomBookingRef()
{
    $letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    $code = $letters[rand(0, 25)] . $letters[rand(0, 25)] . '-' . rand(1000, 9999) . '-' . $letters[rand(0, 25)] . $letters[rand(0, 25)];
    return 'UG-' . $code;
}
