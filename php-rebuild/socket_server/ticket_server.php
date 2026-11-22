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

require __DIR__ . '/../backend/api/config.php';   // reuse the SAME $pdo / SQLite database as the website
date_default_timezone_set('Africa/Kampala');      // check-in times in Uganda time

const DEFAULT_HOST = '0.0.0.0';          // listen on every network card (station LAN / WiFi)
const DEFAULT_PORT = 5050;
const MAX_LINE = 1024;                   // longest command accepted

// ---------------------------------------------------------------- SECURITY settings
const MAX_CLIENTS = 20;                  // most conductors connected at the same time
const LOGIN_TIMEOUT = 30;                // seconds a client may stay connected without logging in
const IDLE_TIMEOUT = 120;                // seconds a logged-in conductor may stay silent
const MAX_LOGIN_TRIES = 3;               // wrong PINs before the client is disconnected
const MAX_BAD_REFS = 5;                  // invalid references in a row before disconnecting

$port = isset($argv[1]) ? (int)$argv[1] : DEFAULT_PORT;
$host = $argv[2] ?? DEFAULT_HOST;        // e.g. 192.168.1.10 to listen on the station LAN only
define('CONDUCTOR_PIN', readConductorPin());

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

/** PIN from the TICKET_PIN environment variable, or typed in when the server starts. */
function readConductorPin(): string
{
    $pin = trim((string)getenv('TICKET_PIN'));
    while (strlen($pin) < 4) {
        echo 'Set the conductor PIN for this session (at least 4 characters): ';
        $input = fgets(STDIN);
        if ($input === false) {
            exit("No PIN given. Set one with TICKET_PIN or type it when asked.\n");
        }
        $pin = trim($input);
    }
    return $pin;
}

/** Decide the reply for one command line. $st is this client's security state. */
function handleCommand(string $line, string $conductor, array &$st): string
{
    $parts = preg_split('/\s+/', $line, 2);
    $command = strtoupper($parts[0]);
    $arg = trim($parts[1] ?? '');

    switch ($command) {
        case 'HELP':
            return 'HELP | LOGIN <pin> | CHECK <ref> = look up ticket | BOARD <ref> = let passenger board (once) | QUIT = disconnect';
        case 'QUIT':
            return 'BYE | Goodbye';

        case 'LOGIN':                                  // SECURITY: conductors must log in
            if ($st['loggedIn']) {
                return 'OK | Already logged in';
            }
            if (hash_equals(CONDUCTOR_PIN, $arg)) {    // constant-time compare
                $st['loggedIn'] = true;
                return 'OK | Logged in. Commands: CHECK <ref>, BOARD <ref>, QUIT';
            }
            $st['loginTries']++;
            if ($st['loginTries'] >= MAX_LOGIN_TRIES) {
                return 'BYE | Too many wrong PINs';
            }
            return 'ERROR | Wrong PIN (' . (MAX_LOGIN_TRIES - $st['loginTries']) . ' tries left)';

        case 'CHECK':
        case 'BOARD':
            if (!$st['loggedIn']) {
                return 'ERROR | Log in first: LOGIN <pin>';
            }
            $ref = normalizeRef($arg);
            if ($ref === '') {
                return "ERROR | Usage: $command <booking ref>";
            }
            try {
                if (!preg_match('/^UG-[A-Z]{2}-\d{4}-[A-Z]{2}$/', $ref)) {
                    $reply = "INVALID | $ref | Not a Uganda Bus booking reference";
                } else {
                    $reply = $command === 'CHECK' ? checkTicket($ref) : boardTicket($ref, $conductor);
                }
            } catch (Throwable $e) {
                logLine('Database error: ' . $e->getMessage());
                return 'ERROR | Server could not read the database, try again';
            }
            // SECURITY: stop clients that keep guessing references
            $st['badRefs'] = str_starts_with($reply, 'INVALID') ? $st['badRefs'] + 1 : 0;
            if ($st['badRefs'] >= MAX_BAD_REFS) {
                return 'BYE | Too many invalid references';
            }
            return $reply;

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
function closeClient(int $id, array &$clients, array &$buffers, array &$peers, array &$state): void
{
    if (isset($clients[$id])) {
        logLine(($peers[$id] ?? '?') . ' disconnected');
        socket_close($clients[$id]);
    }
    unset($clients[$id], $buffers[$id], $peers[$id], $state[$id]);
}

function logLine(string $text): void
{
    echo '[' . date('Y-m-d H:i:s') . "] $text\n";
}
