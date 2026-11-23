<?php
// Background notification worker.
// Run: php php-rebuild/notification_worker.php
// Once: php php-rebuild/notification_worker.php --once

require __DIR__ . '/backend/api/config.php';
require __DIR__ . '/backend/api/notification_queue.php';

$once = in_array('--once', $argv, true);
$interval = 2;

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "notification_worker.php must run from the command line.\n");
    exit(1);
}

echo "Uganda Bus notification worker started.\n";
do {
    $result = processNotificationQueue($pdo, 20);
    if ($result['processed'] > 0) {
        echo sprintf(
            "[%s] processed=%d sent=%d failed=%d\n",
            gmdate('Y-m-d H:i:s'),
            $result['processed'],
            $result['sent'],
            $result['failed']
        );
    }
    if (!$once) {
        sleep($interval);
    }
} while (!$once);
