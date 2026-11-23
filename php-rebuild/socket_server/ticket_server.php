<?php

/**
 * Uganda Bus - Ticket Check TCP Socket Server
 * -------------------------------------------
 * Conductors at the bus station connect to this server over TCP and check
 * passenger tickets by booking reference (e.g. UG-KT-4821-QB).
 *
 * Socket flow (Lecture L5 Sockets / SOCKETS.pptx):
 *   socket() -> bind() -> listen() -> accept() -> recv()/send() -> close()
 *
 * Concurrency: socket_select() lets ONE server process serve MANY conductors
 * at the same time (no fork, so it also works on Windows/XAMPP).
 *
 * Run (from the uganda_Bus folder):
 *   D:\xampp\php\php.exe php-rebuild\socket_server\ticket_server.php [port] [bind-ip]
 *   The server asks you to set the conductor PIN when it starts
 *   (or set it first with:  $env:TICKET_PIN="4821"   in PowerShell).
 *
 * Protocol: plain text, one command per line, one reply line per command.
 *   LOGIN <pin>   log in as a conductor (required before CHECK / BOARD)
 *   CHECK <ref>   look a ticket up (changes nothing)
 *   BOARD <ref>   mark the ticket as used - works only once per ticket
 *   HELP          list commands
 *   QUIT          disconnect
 * <ref> may be the booking reference or the full text from the receipt QR code.
 *
 * Replies start with a status word:
 *   WELCOME, OK, VALID, BOARDED, USED, INVALID, EXPIRED, WRONG_DAY, ERROR, BYE
 *
 * Security (see section "SECURITY" below):
 *   - PIN login before any ticket command; 3 wrong PINs = disconnected
 *   - idle clients disconnected (30 s before login, 2 min after)
 *   - at most 20 conductors connected at once
 *   - 5 invalid references in a row = disconnected (stops guessing)
 *   - every line limited in size; SQL uses prepared statements
 */

if (PHP_SAPI !== 'cli') {               // never start a server from a browser request
    http_response_code(403);
    exit('Run this file from the command line: php ticket_server.php');
}
if (!function_exists('socket_create')) {
    exit("PHP sockets extension is off. In php.ini enable: extension=sockets\n");
}

// Commands, replies, security settings and database code are shared with the fork
// server (ticket_server_fork.php), so both always answer in exactly the same way.
require __DIR__ . '/ticket_protocol.php';

$port = isset($argv[1]) ? (int)$argv[1] : DEFAULT_PORT;
$host = $argv[2] ?? DEFAULT_HOST;        // e.g. 192.168.1.10 to listen on the station LAN only
define('CONDUCTOR_PIN', readConductorPin());

ensureCheckTable($pdo);

// ---------------------------------------------------------------- 1. socket()
$server = socket_create(AF_INET, SOCK_STREAM, SOL_TCP);   // TCP stream socket
if ($server === false) {
    exit('socket_create failed: ' . socket_strerror(socket_last_error()) . "\n");
}
socket_set_option($server, SOL_SOCKET, SO_REUSEADDR, 1);   // restart without "address in use"

// ---------------------------------------------------------------- 2. bind()
if (!@socket_bind($server, $host, $port)) {
    exit("Cannot bind $host:$port: " . socket_strerror(socket_last_error($server)) . "\n");
}

// ---------------------------------------------------------------- 3. listen()
socket_listen($server, 10);              // up to 10 conductors waiting in the queue
logLine("Ticket server listening on $host:$port  (max " . MAX_CLIENTS . " conductors, Ctrl+C to stop)");

$clients = [];                           // id => socket
$buffers = [];                           // id => text received but not yet a full line
$peers = [];                             // id => "ip:port" of the conductor
$state = [];                             // id => [loggedIn, lastActive, loginTries, badRefs]

while (true) {
    $read = $clients;
    $read[] = $server;
    $write = $except = null;

    // Wait until a socket is ready, but wake up at least every 5 s to check idle clients.
    $ready = socket_select($read, $write, $except, 5);
    if ($ready === false) {
        logLine('socket_select error: ' . socket_strerror(socket_last_error()));
        continue;
    }

    // SECURITY: disconnect clients that stay silent too long (stops "hold the line" attacks).
    foreach (array_keys($clients) as $id) {
        $limit = $state[$id]['loggedIn'] ? IDLE_TIMEOUT : LOGIN_TIMEOUT;
        if (time() - $state[$id]['lastActive'] > $limit) {
            sendLine($clients[$id], 'BYE | Disconnected: idle for too long');
            closeClient($id, $clients, $buffers, $peers, $state);
            $read = array_filter($read, fn($s) => $s === $server || isset($clients[spl_object_id($s)]));
        }
    }

    // ------------------------------------------------------------ 4. accept()
    if (in_array($server, $read, true)) {
        $conn = socket_accept($server);
        if ($conn !== false) {
            if (count($clients) >= MAX_CLIENTS) {              // SECURITY: connection limit
                sendLine($conn, 'BYE | Server busy, try again shortly');
                logLine(peer($conn) . ' refused: server full');
                socket_close($conn);
            } else {
                $id = spl_object_id($conn);
                $clients[$id] = $conn;
                $buffers[$id] = '';
                $peers[$id] = peer($conn);
                $state[$id] = ['loggedIn' => false, 'lastActive' => time(), 'loginTries' => 0, 'badRefs' => 0];
                logLine($peers[$id] . ' connected');
                sendLine($conn, 'WELCOME | Uganda Bus ticket check | Log in first: LOGIN <pin>');
            }
        }
        unset($read[array_search($server, $read, true)]);
    }

    // ------------------------------------------------------------ 5. recv() / send()
    foreach ($read as $conn) {
        $id = spl_object_id($conn);
        if (!isset($clients[$id])) {
            continue;
        }
        $data = @socket_read($conn, MAX_LINE, PHP_BINARY_READ);

        if ($data === false || $data === '') {          // conductor closed the connection
            closeClient($id, $clients, $buffers, $peers, $state);
            continue;
        }

        $state[$id]['lastActive'] = time();
        $buffers[$id] .= $data;
        if (strlen($buffers[$id]) > MAX_LINE * 4) {     // protect the server from endless input
            sendLine($conn, 'BYE | Line too long');
            closeClient($id, $clients, $buffers, $peers, $state);
            continue;
        }

        // A command is complete when Enter (\n) arrives; telnet may send one key at a time.
        while (($pos = strpos($buffers[$id], "\n")) !== false) {
            $line = trim(substr($buffers[$id], 0, $pos));
            $buffers[$id] = substr($buffers[$id], $pos + 1);
            if ($line === '') {
                continue;
            }

            $reply = handleCommand($line, $peers[$id], $state[$id]);
            $logged = preg_match('/^login\b/i', $line) ? 'LOGIN ****' : $line;   // never log the PIN
            logLine($peers[$id] . " > $logged  =>  $reply");
            sendLine($conn, $reply);

            if (str_starts_with($reply, 'BYE')) {
                closeClient($id, $clients, $buffers, $peers, $state);
                break;
            }
        }
    }
}

// ==================================================================== helpers
// (the protocol helpers are in ticket_protocol.php)

// ---------------------------------------------------------------- 6. close()
function closeClient(int $id, array &$clients, array &$buffers, array &$peers, array &$state): void
{
    if (isset($clients[$id])) {
        logLine(($peers[$id] ?? '?') . ' disconnected');
        socket_close($clients[$id]);
    }
    unset($clients[$id], $buffers[$id], $peers[$id], $state[$id]);
}
