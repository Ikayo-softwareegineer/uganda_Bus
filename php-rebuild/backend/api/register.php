<?php
require __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
}

$data = readJsonBody();
$name = trim($data['name'] ?? '');
$email = strtolower(trim($data['email'] ?? ''));
$password = trim($data['password'] ?? '');

// Same rules as the frontend - the server checks again because the client can be bypassed
if ($name === '' || $email === '' || $password === '') {
    jsonResponse(['success' => false, 'message' => 'Please complete all fields.'], 400);
}
if (!preg_match("/^[A-Za-z][A-Za-z\\s'.-]*$/", $name)) {
    jsonResponse(['success' => false, 'message' => 'Name should contain letters only (no numbers or symbols).'], 400);
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    jsonResponse(['success' => false, 'message' => 'Please enter a valid email address (e.g. you@example.com).'], 400);
}
if (strlen($password) < 6) {
    jsonResponse(['success' => false, 'message' => 'Password must be at least 6 characters.'], 400);
}

$check = $pdo->prepare('SELECT id FROM users WHERE email = ?');
$check->execute([$email]);
if ($email === ADMIN_EMAIL || $check->fetch()) {
    jsonResponse(['success' => false, 'message' => 'An account with this email already exists. Please log in.'], 409);
}

$insert = $pdo->prepare('INSERT INTO users (name, email, phone, password, role) VALUES (?, ?, ?, ?, ?)');
$insert->execute([$name, $email, '', password_hash($password, PASSWORD_DEFAULT), 'CUSTOMER']);

// Not logged in automatically - the user must log in with these credentials
jsonResponse(['success' => true, 'message' => 'Account created successfully.'], 201);
