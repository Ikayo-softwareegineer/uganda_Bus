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
 *   D:\xampp\php\php.exe php-rebuild\socket-server\ticket_server.php
 *   (optional port:  ... ticket_server.php 6000)
 *
 * Protocol: plain text, one command per line, one reply line per command.
 *   CHECK <ref>   look a ticket up (changes nothing)
 *   BOARD <ref>   mark the ticket as used - works only once per ticket
 *   HELP          list commands
 *   QUIT          disconnect
 * <ref> may be the booking reference or the full text from the receipt QR code.
 *
 * Replies start with a status word:
 *   WELCOME, VALID, BOARDED, USED, INVALID, EXPIRED, WRONG_DAY, ERROR, BYE
 */

if (PHP_SAPI !== 'cli') {               // never start a server from a browser request
    http_response_code(403);
    exit('Run this file from the command line: php ticket_server.php');
}
if (!function_exists('socket_create')) {
    exit("PHP sockets extension is off. In php.ini enable: extension=sockets\n");
}

require __DIR__ . '/../backend/api/config.php';   // reuse the SAME $pdo / SQLite database as the website
date_default_timezone_set('Africa/Kampala');      // check-in times in Uganda time

const HOST = '0.0.0.0';                  // listen on every network card (station LAN / WiFi)
const DEFAULT_PORT = 5050;
const MAX_LINE = 1024;                   // longest command accepted

$port = isset($argv[1]) ? (int)$argv[1] : DEFAULT_PORT;

// Own table for check-ins, so the existing tables and init_db.php stay untouched.
$pdo->setAttribute(PDO::ATTR_TIMEOUT, 5);           // wait if the website is writing at the same moment
$pdo->exec('CREATE TABLE IF NOT EXISTS ticket_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_ref TEXT NOT NULL UNIQUE,
    conductor_ip TEXT NOT NULL,
    checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);');

// ---------------------------------------------------------------- 1. socket()
$server = socket_create(AF_INET, SOCK_STREAM, SOL_TCP);   // TCP stream socket
if ($server === false) {
    exit('socket_create failed: ' . socket_strerror(socket_last_error()) . "\n");
}
socket_set_option($server, SOL_SOCKET, SO_REUSEADDR, 1);   // restart without "address in use"

// ---------------------------------------------------------------- 2. bind()
if (!@socket_bind($server, HOST, $port)) {
    exit("Cannot bind port $port: " . socket_strerror(socket_last_error($server)) . "\n");
}

// ---------------------------------------------------------------- 3. listen()
socket_listen($server, 10);              // up to 10 conductors waiting in the queue
logLine("Ticket server listening on " . HOST . ":$port  (Ctrl+C to stop)");

$clients = [];                           // id => socket
$buffers = [];                           // id => text received but not yet a full line
$peers = [];                             // id => "ip:port" of the conductor

while (true) {
    $read = $clients;
    $read[] = $server;
    $write = $except = null;

    // Wait until the server socket (new conductor) or a conductor socket (new data) is ready.
    if (socket_select($read, $write, $except, null) === false) {
        logLine('socket_select error: ' . socket_strerror(socket_last_error()));
        continue;
    }

    // ------------------------------------------------------------ 4. accept()
    if (in_array($server, $read, true)) {
        $conn = socket_accept($server);
        if ($conn !== false) {
            $id = spl_object_id($conn);
            $clients[$id] = $conn;
            $buffers[$id] = '';
            $peers[$id] = peer($conn);
            logLine($peers[$id] . ' connected');
            sendLine($conn, 'WELCOME | Uganda Bus ticket check | Commands: CHECK <ref>, BOARD <ref>, HELP, QUIT');
        }
        unset($read[array_search($server, $read, true)]);
    }

    // ------------------------------------------------------------ 5. recv() / send()
    foreach ($read as $conn) {
        $id = spl_object_id($conn);
        $data = @socket_read($conn, MAX_LINE, PHP_BINARY_READ);

        if ($data === false || $data === '') {          // conductor closed the connection
            closeClient($id, $clients, $buffers, $peers);
            continue;
        }

        $buffers[$id] .= $data;
        if (strlen($buffers[$id]) > MAX_LINE * 4) {     // protect the server from endless input
            sendLine($conn, 'ERROR | Line too long');
            closeClient($id, $clients, $buffers, $peers);
            continue;
        }

        // A command is complete when Enter (\n) arrives; telnet may send one key at a time.
        while (($pos = strpos($buffers[$id], "\n")) !== false) {
            $line = trim(substr($buffers[$id], 0, $pos));
            $buffers[$id] = substr($buffers[$id], $pos + 1);
            if ($line === '') {
                continue;
            }

            $reply = handleCommand($line, $peers[$id]);
            logLine($peers[$id] . " > $line  =>  $reply");
            sendLine($conn, $reply);

            if (str_starts_with($reply, 'BYE')) {
                closeClient($id, $clients, $buffers, $peers);
                break;
            }
        }
    }
}

// ==================================================================== helpers

/** Decide the reply for one command line. */
function handleCommand(string $line, string $conductor): string
{
    $parts = preg_split('/\s+/', $line, 2);
    $command = strtoupper($parts[0]);
    $ref = normalizeRef($parts[1] ?? '');

    switch ($command) {
        case 'HELP':
            return 'HELP | CHECK <ref> = look up ticket | BOARD <ref> = let passenger board (once) | QUIT = disconnect';
        case 'QUIT':
            return 'BYE | Goodbye';
        case 'CHECK':
        case 'BOARD':
            if ($ref === '') {
                return "ERROR | Usage: $command <booking ref>";
            }
            if (!preg_match('/^UG-[A-Z]{2}-\d{4}-[A-Z]{2}$/', $ref)) {
                return "INVALID | $ref | Not a Uganda Bus booking reference";
            }
            try {
                return $command === 'CHECK' ? checkTicket($ref) : boardTicket($ref, $conductor);
            } catch (Throwable $e) {
                logLine('Database error: ' . $e->getMessage());
                return 'ERROR | Server could not read the database, try again';
            }
        default:
            return "ERROR | Unknown command '$command'. Type HELP";
    }
}

/** Accept "ug-kt-4821-qb" or the QR text "UGANDA-BUS|UG-KT-4821-QB|3|1A,1B|..." */
function normalizeRef(string $input): string
{
    $input = strtoupper(trim($input));
    if (str_starts_with($input, 'UGANDA-BUS|')) {
        $input = explode('|', $input)[1] ?? '';
    }
    return trim($input);
}

/** Booking + trip + route + bus + check-in (if any), or null. */
function findTicket(string $ref): ?array
{
    global $pdo;
    $stmt = $pdo->prepare(
        'SELECT b.booking_ref, b.user_name, b.seats, b.total_amount, b.payment_status,
                t.departure_time, r.origin, r.destination, v.reg_number,
                c.checked_at
         FROM bookings b
         JOIN trips t    ON t.id = b.trip_id
         JOIN routes r   ON r.id = t.route_id
         JOIN vehicles v ON v.id = t.vehicle_id
         LEFT JOIN ticket_checks c ON c.booking_ref = b.booking_ref
         WHERE b.booking_ref = ?'
    );
    $stmt->execute([$ref]);
    return $stmt->fetch() ?: null;
}

/** One-line summary a conductor can read quickly. */
function describe(array $t): string
{
    $payment = $t['payment_status'] === 'PAY_AT_STATION'
        ? 'COLLECT CASH UGX ' . number_format((int)$t['total_amount'])
        : $t['payment_status'];
    return implode(' | ', [
        $t['booking_ref'],
        $t['user_name'],
        $t['origin'] . ' -> ' . $t['destination'],
        substr($t['departure_time'], 0, 16),
        'Bus ' . $t['reg_number'],
        'Seats ' . $t['seats'],
        $payment,
    ]);
}

/** CHECK: read only. */
function checkTicket(string $ref): string
{
    $t = findTicket($ref);
    if (!$t) {
        return "INVALID | $ref | No such booking";
    }
    if ($t['checked_at']) {
        return 'USED | Already boarded at ' . $t['checked_at'] . ' | ' . describe($t);
    }
    $travelDay = substr($t['departure_time'], 0, 10);
    if ($travelDay < date('Y-m-d')) {
        return 'EXPIRED | Trip was on ' . $travelDay . ' | ' . describe($t);
    }
    return 'VALID | ' . describe($t);
}

/** BOARD: one transaction, so a ticket can never be used twice. */
function boardTicket(string $ref, string $conductor): string
{
    global $pdo;
    $pdo->beginTransaction();
    try {
        $t = findTicket($ref);
        $travelDay = $t ? substr($t['departure_time'], 0, 10) : '';

        if (!$t) {
            $reply = "INVALID | $ref | No such booking";
        } elseif ($t['checked_at']) {
            $reply = 'USED | Already boarded at ' . $t['checked_at'] . ' | ' . describe($t);
        } elseif ($travelDay < date('Y-m-d')) {
            $reply = 'EXPIRED | Trip was on ' . $travelDay . ' | ' . describe($t);
        } elseif ($travelDay > date('Y-m-d')) {
            $reply = 'WRONG_DAY | Ticket is for ' . $travelDay . ' | ' . describe($t);
        } else {
            $insert = $pdo->prepare('INSERT INTO ticket_checks (booking_ref, conductor_ip, checked_at) VALUES (?, ?, ?)');
            $insert->execute([$ref, $conductor, date('Y-m-d H:i:s')]);
            $pdo->commit();
            return 'BOARDED | ' . describe($t);
        }
        $pdo->rollBack();                               // nothing changed
        return $reply;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}

function sendLine($conn, string $text): void
{
    @socket_write($conn, $text . "\r\n");               // \r\n so telnet/PuTTY show new lines
}

function peer($conn): string
{
    @socket_getpeername($conn, $ip, $port);
    return ($ip ?? '?') . ':' . ($port ?? '?');
}

// ---------------------------------------------------------------- 6. close()
function closeClient(int $id, array &$clients, array &$buffers, array &$peers): void
{
    if (isset($clients[$id])) {
        logLine(($peers[$id] ?? '?') . ' disconnected');
        socket_close($clients[$id]);
    }
    unset($clients[$id], $buffers[$id], $peers[$id]);
}

function logLine(string $text): void
{
    echo '[' . date('Y-m-d H:i:s') . "] $text\n";
}
