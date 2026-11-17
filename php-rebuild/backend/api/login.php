<?php
require __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
}

$data = readJsonBody();
$email = strtolower(trim($data['email'] ?? ''));
$password = trim($data['password'] ?? '');

if ($email === '' || $password === '') {
    jsonResponse(['success' => false, 'message' => 'Please enter email and password.'], 400);
}

$stmt = $pdo->prepare('SELECT * FROM users WHERE email = ?');
$stmt->execute([$email]);
$user = $stmt->fetch();

if ($email === ADMIN_EMAIL) {
    if (ADMIN_PASSWORD === '') {
        jsonResponse(['success' => false, 'message' => 'The administrator password is not configured on the server.'], 503);
    }
    // The administrator password comes from the server environment.
    if ($password !== ADMIN_PASSWORD) {
        jsonResponse(['success' => false, 'message' => 'Invalid admin email or password.'], 401);
    }
    $user = ['id' => $user['id'] ?? 0, 'name' => 'Admin', 'email' => ADMIN_EMAIL, 'role' => 'admin'];
} elseif (!$user || !password_verify($password, $user['password'])) {
    jsonResponse(['success' => false, 'message' => 'Invalid email or password. If you are new, please register first.'], 401);
} elseif (strtoupper($user['role']) === 'ADMIN') {
    jsonResponse(['success' => false, 'message' => 'Invalid admin email or password.'], 401);
} elseif (!empty($user['blocked'])) {
    jsonResponse(['success' => false, 'message' => 'This account has been suspended. Please contact Uganda Bus support.'], 403);
}

// Remember the user on the server for later requests (booking, admin)
session_regenerate_id(true);
$_SESSION['user'] = [
    'id' => (int)$user['id'],
    'name' => $user['name'],
    'email' => $user['email'],
    'role' => strtolower($user['role'])
];

jsonResponse(['success' => true, 'user' => $_SESSION['user']]);
