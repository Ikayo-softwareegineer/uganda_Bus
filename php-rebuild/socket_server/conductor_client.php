<?php

/**
 * Uganda Bus - Conductor TCP Client
 * ---------------------------------
 * Client side of the ticket check system.
 * Socket flow: socket() -> connect() -> send()/recv() -> close()
 *
 * Run:  D:\xampp\php\php.exe php-rebuild\socket-server\conductor_client.php [server-ip] [port]
 *       default server-ip 127.0.0.1, port 5050
 *
 * Then type: CHECK UG-KT-4821-QB   or   BOARD UG-KT-4821-QB   or   QUIT
 * (telnet <server-ip> 5050 or PuTTY "Raw" also work as a client.)
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('Run this file from the command line.');
}
if (!function_exists('socket_create')) {
    exit("PHP sockets extension is off. In php.ini enable: extension=sockets\n");
}

$host = $argv[1] ?? '127.0.0.1';
$port = isset($argv[2]) ? (int)$argv[2] : 5050;

// 1. socket()
$sock = socket_create(AF_INET, SOCK_STREAM, SOL_TCP);

// 2. connect()
if (!@socket_connect($sock, $host, $port)) {
    exit("Cannot connect to $host:$port - is ticket_server.php running?\n");
}

echo readReply($sock) . "\n";                       // WELCOME line

// 3. send() / recv() - one command, one reply
while (true) {
    echo 'conductor> ';
    $line = fgets(STDIN);
    if ($line === false) {                          // Ctrl+Z / end of input
        $line = 'QUIT';
    }
    $line = trim($line);
    if ($line === '') {
        continue;
    }

    socket_write($sock, $line . "\n");
    $reply = readReply($sock);
    if ($reply === null) {
        echo "Server closed the connection.\n";
        break;
    }
    echo $reply . "\n";
    if (str_starts_with($reply, 'BYE')) {
        break;
    }
}

// 4. close()
socket_close($sock);

/** Read one non-empty reply line from the server. */
function readReply($sock): ?string
{
    while (true) {
        $line = @socket_read($sock, 2048, PHP_NORMAL_READ);
        if ($line === false || $line === '') {
            return null;
        }
        if (trim($line) !== '') {
            return trim($line);
        }
    }
}
