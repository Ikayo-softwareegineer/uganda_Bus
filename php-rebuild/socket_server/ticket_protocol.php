<?php

/**
 * Uganda Bus - ticket check protocol (shared code)
 * ------------------------------------------------
 * The commands, replies and security rules of the conductor protocol, used by BOTH servers:
 *   ticket_server.php       one process, many conductors, using socket_select()   (Babirye)
 *   ticket_server_fork.php  one process PER conductor, using fork()               (Ronnie)
 * Keeping them in one file means both servers always answer in exactly the same way.
 *
 * Moved here unchanged from ticket_server.php, except boardTicket(), which is now safe when
 * several processes board the same ticket at the same moment (see its comment).
 */

require_once __DIR__ . '/../backend/api/config.php';   // the SAME SQLite database as the website
date_default_timezone_set('Africa/Kampala');           // check-in times in Uganda time

const DEFAULT_HOST = '0.0.0.0';          // listen on every network card (station LAN / WiFi)
const DEFAULT_PORT = 5050;
const MAX_LINE = 1024;                   // longest command accepted

// ---------------------------------------------------------------- SECURITY settings
const MAX_CLIENTS = 20;                  // most conductors connected at the same time
const LOGIN_TIMEOUT = 30;                // seconds a client may stay connected without logging in
const IDLE_TIMEOUT = 120;                // seconds a logged-in conductor may stay silent
const MAX_LOGIN_TRIES = 3;               // wrong PINs before the client is disconnected
const MAX_BAD_REFS = 5;                  // invalid references in a row before disconnecting

/** Own table for check-ins, so the existing tables and init_db.php stay untouched. */
function ensureCheckTable(PDO $pdo): void
{
    $pdo->setAttribute(PDO::ATTR_TIMEOUT, 5);           // wait if the website is writing at the same moment
    $pdo->exec('CREATE TABLE IF NOT EXISTS ticket_checks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_ref TEXT NOT NULL UNIQUE,
        conductor_ip TEXT NOT NULL,
        checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );');
}

/**
 * DEMO ONLY: pretend each ticket lookup is slow (e.g. a slow database or network),
 * so the difference between iterative, select() and fork() servers is easy to see.
 * Off unless the TICKET_DEMO_DELAY_MS environment variable is set, e.g. 2000.
 */
function demoDelay(): void
{
    $ms = (int)getenv('TICKET_DEMO_DELAY_MS');
    if ($ms > 0) {
        usleep(min($ms, 10000) * 1000);
    }
}

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
    demoDelay();
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

/**
 * BOARD: one transaction, so a ticket can never be used twice - even when several
 * processes (ticket_server_fork.php) board the same ticket at the same moment.
 *
 * BEGIN IMMEDIATE takes SQLite's write lock at the START of the transaction. Other
 * processes then wait their turn (busy_timeout) and, when they get it, see that the
 * ticket is already used. With a plain BEGIN (deferred), all of them read first and
 * then fail together with "database is locked" when they try to write.
 * The transaction is started with SQL, so it is ended with SQL (COMMIT / ROLLBACK).
 */
function boardTicket(string $ref, string $conductor): string
{
    global $pdo;
    demoDelay();                                        // slow work happens BEFORE taking the lock
    $pdo->exec('BEGIN IMMEDIATE');
    $open = true;
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
            $pdo->exec('COMMIT');
            return 'BOARDED | ' . describe($t);
        }
        $pdo->exec('ROLLBACK');                         // nothing changed
        return $reply;
    } catch (Throwable $e) {
        if ($open) {
            try {
                $pdo->exec('ROLLBACK');
            } catch (Throwable $ignored) {
                // the transaction was already closed by SQLite
            }
        }
        // Last line of defence: the UNIQUE rule on booking_ref refused a second check-in
        if ($e instanceof PDOException && $e->getCode() === '23000') {
            $t = findTicket($ref);
            return 'USED | Already boarded at ' . ($t['checked_at'] ?? '?') . ' | ' . ($t ? describe($t) : $ref);
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

function logLine(string $text): void
{
    echo '[' . date('Y-m-d H:i:s') . "] $text\n";
}
