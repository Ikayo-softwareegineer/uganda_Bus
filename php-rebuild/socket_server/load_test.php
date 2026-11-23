<?php

/**
 * Uganda Bus - load test for the ticket servers
 * ---------------------------------------------
 * Connects N conductors AT THE SAME TIME and measures how long each one waits.
 * Use it to compare an iterative server with the concurrent ones (Lecture: fork.pdf, L4).
 *
 *   php load_test.php [options]
 *     --port=5050        server port                    --clients=5    conductors at once
 *     --host=127.0.0.1   server address                 --pin=4821     conductor PIN
 *     --refs=A,B,C       booking references to CHECK (cycled over the clients)
 *     --board=REF        every conductor tries to BOARD the SAME ticket (race test:
 *                        exactly one should get BOARDED, all others USED)
 *
 * Start the server with a demo delay so each check takes a known time, e.g. 1 second:
 *   TICKET_DEMO_DELAY_MS=1000 TICKET_PIN=4821 php ticket_server_fork.php 5051
 *
 * Works on Windows too (it uses stream_select(), not fork()).
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('Run from the command line.');
}

$opt = getopt('', ['port:', 'host:', 'clients:', 'pin:', 'refs:', 'board:']);
$host = $opt['host'] ?? '127.0.0.1';
$port = (int)($opt['port'] ?? 5050);
$count = max(1, min(50, (int)($opt['clients'] ?? 5)));
$pin = $opt['pin'] ?? (getenv('TICKET_PIN') ?: '4821');
$boardRef = $opt['board'] ?? null;
$refs = array_values(array_filter(explode(',', $opt['refs'] ?? '')));
if (!$boardRef && !$refs) {
    exit("Give booking references: --refs=UG-AB-1234-CD,UG-EF-5678-GH  (or --board=REF for the race test)\n");
}

// Each conductor sends these lines, one after each reply from the server
$clients = [];
for ($i = 0; $i < $count; $i++) {
    $command = $boardRef ? "BOARD $boardRef" : 'CHECK ' . $refs[$i % count($refs)];
    $clients[$i] = [
        'script' => ["LOGIN $pin", $command, 'QUIT'],
        'step' => 0,           // how many lines sent so far
        'buffer' => '',
        'replies' => [],
        'done' => false,
        'ms' => null,
    ];
}

printf("Connecting %d conductors to %s:%d at the same time...\n", $count, $host, $port);
$start = microtime(true);

foreach ($clients as $i => &$c) {
    $sock = @stream_socket_client("tcp://$host:$port", $errno, $err, 5);
    if (!$sock) {
        exit("Cannot connect to $host:$port ($err). Is the server running?\n");
    }
    stream_set_blocking($sock, false);
    $c['sock'] = $sock;
}
unset($c);

// One loop watches every conductor's socket and answers each reply with the next line
while (array_filter($clients, fn($c) => !$c['done'])) {
    $read = [];
    foreach ($clients as $c) {
        if (!$c['done']) {
            $read[] = $c['sock'];
        }
    }
    $write = $except = null;
    if (stream_select($read, $write, $except, 30) === 0) {
        exit("No reply for 30 s - stopping.\n");
    }
    foreach ($clients as $i => &$c) {
        if ($c['done'] || !in_array($c['sock'], $read, true)) {
            continue;
        }
        $chunk = fread($c['sock'], 8192);
        if ($chunk === '' || $chunk === false) {
            if (feof($c['sock'])) {          // server closed the connection
                $c['done'] = true;
                $c['ms'] = $c['ms'] ?? (microtime(true) - $start) * 1000;
            }
            continue;
        }
        $c['buffer'] .= $chunk;
        while (($pos = strpos($c['buffer'], "\n")) !== false) {
            $line = rtrim(substr($c['buffer'], 0, $pos));
            $c['buffer'] = substr($c['buffer'], $pos + 1);
            $c['replies'][] = $line;
            if ($c['step'] < count($c['script'])) {
                fwrite($c['sock'], $c['script'][$c['step']] . "\n");
                $c['step']++;
                if ($c['step'] === count($c['script'])) {     // reply to CHECK/BOARD received: stop the clock
                    $c['ms'] = (microtime(true) - $start) * 1000;
                }
            }
            if (str_starts_with($line, 'BYE')) {
                $c['done'] = true;
                fclose($c['sock']);
                break;
            }
        }
    }
    unset($c);
}
$total = (microtime(true) - $start) * 1000;

// ---------------------------------------------------------------- results
$statuses = [];
echo "\n Conductor | Waited (ms) | Server's answer\n-----------+-------------+-------------------------------\n";
foreach ($clients as $i => $c) {
    $answer = $c['replies'][2] ?? end($c['replies']);   // WELCOME, OK, then the CHECK/BOARD reply
    $word = strtok((string)$answer, ' |');
    $statuses[$word] = ($statuses[$word] ?? 0) + 1;
    printf(" %9d | %11.0f | %s\n", $i + 1, $c['ms'], substr((string)$answer, 0, 60));
}
$times = array_column($clients, 'ms');
printf("\nAll %d conductors finished in %.0f ms (fastest %.0f ms, slowest %.0f ms)\n",
    $count, $total, min($times), max($times));
echo 'Answers: ' . implode(', ', array_map(fn($k, $v) => "$v x $k", array_keys($statuses), $statuses)) . "\n";
