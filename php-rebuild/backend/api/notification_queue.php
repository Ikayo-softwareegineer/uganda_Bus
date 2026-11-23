<?php
// SQLite-backed message queue and notification worker helpers.

function enqueueNotification(
    PDO $pdo,
    string $bookingRef,
    string $recipient,
    string $recipientName,
    string $channel,
    string $type,
    array $payload
): int {
    if (!in_array($channel, ['EMAIL', 'SMS'], true)) {
        throw new InvalidArgumentException('Unknown notification channel');
    }

    $stmt = $pdo->prepare(
        'INSERT INTO notification_queue
         (booking_ref, recipient, recipient_name, channel, notification_type, payload)
         VALUES (?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute([
        $bookingRef,
        $recipient,
        $recipientName,
        $channel,
        $type,
        json_encode($payload, JSON_UNESCAPED_SLASHES),
    ]);
    return (int)$pdo->lastInsertId();
}

function notificationSummary(PDO $pdo): array
{
    $counts = $pdo->query(
        'SELECT status, COUNT(*) AS count
         FROM notification_queue
         GROUP BY status'
    )->fetchAll();

    $summary = ['pending' => 0, 'sent' => 0, 'failed' => 0];
    foreach ($counts as $row) {
        $key = strtolower((string)$row['status']);
        if (isset($summary[$key])) {
            $summary[$key] = (int)$row['count'];
        }
    }

    $recent = $pdo->query(
        'SELECT id, booking_ref, recipient, recipient_name, channel,
                notification_type, payload, status, attempts, processed_at,
                last_error, created_at
         FROM notification_queue
         ORDER BY id DESC
         LIMIT 20'
    )->fetchAll();

    return ['counts' => $summary, 'recent' => $recent];
}

function processNotificationQueue(PDO $pdo, int $limit = 20): array
{
    $processed = 0;
    $sent = 0;
    $failed = 0;

    $jobs = $pdo->prepare(
        'SELECT * FROM notification_queue
         WHERE status IN ("PENDING", "FAILED")
           AND attempts < 3
           AND available_at <= CURRENT_TIMESTAMP
         ORDER BY id ASC
         LIMIT ?'
    );
    $jobs->bindValue(1, $limit, PDO::PARAM_INT);
    $jobs->execute();

    $outboxDir = dirname(__DIR__, 2) . '/notifications';
    if (!is_dir($outboxDir)) {
        mkdir($outboxDir, 0777, true);
    }

    foreach ($jobs->fetchAll() as $job) {
        $processed++;
        $attempt = (int)$job['attempts'] + 1;

        try {
            $payload = json_decode((string)$job['payload'], true);
            if (!is_array($payload)) {
                throw new RuntimeException('Invalid notification payload');
            }

            // This project sends no external email/SMS API. The worker writes an
            // auditable outbox entry and marks the queue item SENT, keeping the
            // demo realistic and replacing the external sender with one line in
            // production.
            $outbox = [
                'notificationId' => (int)$job['id'],
                'bookingRef' => $job['booking_ref'],
                'channel' => $job['channel'],
                'type' => $job['notification_type'],
                'recipient' => $job['recipient'],
                'recipientName' => $job['recipient_name'],
                'payload' => $payload,
                'attempt' => $attempt,
                'sentAt' => gmdate('Y-m-d H:i:s'),
            ];
            $filename = 'notification-' . (int)$job['id'] . '-' . time() . '.json';
            if (file_put_contents($outboxDir . '/' . $filename, json_encode($outbox, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)) === false) {
                throw new RuntimeException('Could not write notification outbox');
            }

            $pdo->prepare(
                'UPDATE notification_queue
                 SET status = "SENT", attempts = ?, processed_at = ?, last_error = NULL
                 WHERE id = ?'
            )->execute([$attempt, gmdate('Y-m-d H:i:s'), $job['id']]);
            $sent++;
        } catch (Throwable $error) {
            $status = $attempt >= 3 ? 'FAILED' : 'PENDING';
            $pdo->prepare(
                'UPDATE notification_queue
                 SET status = ?, attempts = ?, last_error = ?, available_at = ?
                 WHERE id = ?'
            )->execute([
                $status,
                $attempt,
                $error->getMessage(),
                gmdate('Y-m-d H:i:s', time() + 5),
                $job['id'],
            ]);
            $failed++;
        }
    }

    return ['processed' => $processed, 'sent' => $sent, 'failed' => $failed];
}
