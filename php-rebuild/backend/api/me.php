<?php
// Who is logged in? Used by the pages when they load, to check the PHP session.
//   GET -> { user: {...} } or 401 when nobody is logged in
require __DIR__ . '/config.php';

$user = requireLogin();

$stmt = $pdo->prepare('SELECT phone, blocked FROM users WHERE id = ?');
$stmt->execute([$user['id']]);
$row = $stmt->fetch();
if ($row && (int)$row['blocked'] === 1) {
    session_destroy();
    jsonResponse(['success' => false, 'message' => 'This account has been suspended.'], 401);
}

jsonResponse(['success' => true, 'user' => $user + ['phone' => $row['phone'] ?? '']]);
