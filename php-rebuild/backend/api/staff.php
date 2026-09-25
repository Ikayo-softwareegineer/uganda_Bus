<?php
require __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $staff = $pdo->query("SELECT id, name, email, phone, role FROM users WHERE role IN ('staff', 'admin') ORDER BY name ASC")->fetchAll();
    jsonResponse(['success' => true, 'staff' => $staff]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
}

$data = json_decode(file_get_contents('php://input'), true);
if (!$data) {
    jsonResponse(['success' => false, 'message' => 'Invalid JSON payload'], 400);
}

$name = trim((string)($data['name'] ?? ''));
$email = trim(strtolower((string)($data['email'] ?? '')));
$phone = trim((string)($data['phone'] ?? ''));
$password = trim((string)($data['password'] ?? ''));
$role = trim(strtolower((string)($data['role'] ?? 'staff')));

if ($name === '' || $email === '' || $phone === '' || $password === '') {
    jsonResponse(['success' => false, 'message' => 'Please complete all staff details'], 400);
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    jsonResponse(['success' => false, 'message' => 'Please provide a valid email address'], 400);
}

if (!in_array($role, ['staff', 'admin'], true)) {
    $role = 'staff';
}

$exists = $pdo->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
$exists->execute([':email' => $email]);
if ($exists->fetch()) {
    jsonResponse(['success' => false, 'message' => 'A user with that email already exists'], 409);
}

$stmt = $pdo->prepare('INSERT INTO users (name, email, phone, password, role) VALUES (?, ?, ?, ?, ?)');
$stmt->execute([$name, $email, $phone, $password, $role]);

jsonResponse([
    'success' => true,
    'message' => 'Staff member added successfully',
    'staff' => [
        'name' => $name,
        'email' => $email,
        'phone' => $phone,
        'role' => $role
    ]
]);
