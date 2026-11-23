<?php

/**
 * Uganda Bus - Concurrent Ticket Check Server using fork()
 * --------------------------------------------------------
 * Same conductor protocol as ticket_server.php (LOGIN / CHECK / BOARD / QUIT), but a
 * different way of serving many conductors at once (Lecture: fork.pdf, L4 Concurrency):
 *
 *   ticket_server.php        ONE process watches every connection with socket_select()
 *   ticket_server_fork.php   the parent process keeps listening; for every conductor it
 *                            fork()s a CHILD process that serves only that conductor
 *
 *             listening socket :5050  (parent, pid 100)
 *                 |  accept()
 *                 +-- fork() --> child pid 101 --- connected socket --- conductor A
 *                 +-- fork() --> child pid 102 --- connected socket --- conductor B
 *                 +-- fork() --> child pid 103 --- connected socket --- conductor C
 *
 * Three modes, so the techniques from the lecture can be compared:
 *   (default)     concurrent: fork() one child per conductor
 *   --iterative   iterative: serve one conductor at a time, the next one waits
 *   --prefork=N   pre-forked: start N children at the beginning; each accepts
 *                 conductors itself (no fork() while conductors wait)
 *
 * Run (Linux, macOS, WSL or Docker - fork() does not exist on Windows; on Windows use
 * ticket_server.php, which uses socket_select() instead):
 *   TICKET_PIN=4821 php php-rebuild/socket_server/ticket_server_fork.php [port] [bind-ip] [--iterative|--prefork=N]
 *
 * Watch the processes while conductors are connected:
 *   ps -o pid,ppid,stat,cmd -C php
 */

if (PHP_SAPI !== 'cli') {               // never start a server from a browser request
    http_response_code(403);
    exit('Run this file from the command line: php ticket_server_fork.php');
}
foreach (['socket_create' => 'sockets', 'pcntl_fork' => 'pcntl', 'posix_kill' => 'posix'] as $fn => $ext) {
    if (!function_exists($fn)) {
        exit("The PHP '$ext' extension is missing. fork() needs Linux, macOS, WSL or Docker"
            . ($ext === 'sockets' ? '' : " (on Windows, run ticket_server.php instead)") . ".\n");
    }
}

require __DIR__ . '/ticket_protocol.php';   // same commands, replies and security rules as ticket_server.php

// ---------------------------------------------------------------- settings from the command line
$positional = [];
$mode = 'fork';
$preforkWorkers = 4;
foreach (array_slice($argv, 1) as $arg) {
    if ($arg === '--iterative') {
        $mode = 'iterative';
    } elseif (preg_match('/^--prefork(?:=(\d+))?$/', $arg, $m)) {
        $mode = 'prefork';
        $preforkWorkers = max(1, min(MAX_CLIENTS, (int)($m[1] ?? 4)));
    } else {
        $positional[] = $arg;
    }
}
$port = isset($positional[0]) ? (int)$positional[0] : DEFAULT_PORT;
$host = $positional[1] ?? DEFAULT_HOST;
define('CONDUCTOR_PIN', readConductorPin());

ensureCheckTable($pdo);

// A database connection must NOT be shared between processes: two processes writing through
// one SQLite handle can corrupt it. The parent closes its connection here, and every process
// that serves conductors opens its own (openDatabase() in serveClient()).
$pdo = null;

// ---------------------------------------------------------------- socket() bind() listen()
$server = socket_create(AF_INET, SOCK_STREAM, SOL_TCP);
if ($server === false) {
    exit('socket_create failed: ' . socket_strerror(socket_last_error()) . "\n");
}
socket_set_option($server, SOL_SOCKET, SO_REUSEADDR, 1);
if (!@socket_bind($server, $host, $port)) {
    exit("Cannot bind $host:$port: " . socket_strerror(socket_last_error($server)) . "\n");
}
socket_listen($server, 10);              // up to 10 conductors can wait in the queue

$label = ['fork' => 'concurrent: fork() per conductor', 'iterative' => 'iterative: one conductor at a time',
          'prefork' => "pre-forked: $preforkWorkers workers"][$mode];
plog("Ticket server listening on $host:$port  ($label, Ctrl+C to stop)");

// ---------------------------------------------------------------- signals
// pcntl_async_signals(true): PHP runs our signal handlers as soon as a signal arrives.
pcntl_async_signals(true);

$children = [];                          // pid => "ip:port" of the conductor (or "worker")
$shuttingDown = false;

/**
 * waitpid(): collect children that have finished. Until the parent does this, a finished
 * child stays in the process table as a "zombie" (state Z in ps). WNOHANG = do not wait if
 * no child has finished yet; the loop collects several children that finished together.
 */
function reapChildren(): void
{
    global $children;
    while (($pid = pcntl_waitpid(-1, $status, WNOHANG)) > 0) {
        $code = pcntl_wifexited($status) ? pcntl_wexitstatus($status) : 'signal ' . pcntl_wtermsig($status);
        plog("child $pid finished (" . ($children[$pid] ?? '?') . ", exit $code)");
        unset($children[$pid]);
    }
}

// The last argument (false) means "do not restart": a signal wakes the parent up from
// socket_accept(), so it can notice Ctrl+C / stop requests straight away.
pcntl_signal(SIGCHLD, fn() => reapChildren(), false);
pcntl_signal(SIGTERM, function () use (&$shuttingDown) { $shuttingDown = true; }, false);
pcntl_signal(SIGINT, function () use (&$shuttingDown) { $shuttingDown = true; }, false);

// ---------------------------------------------------------------- the three modes
if ($mode === 'iterative') {
    runIterative($server);
} elseif ($mode === 'prefork') {
    runPrefork($server, $preforkWorkers);
} else {
    runForkPerClient($server);
}
shutdown($server);

// ==================================================================== modes

/** ITERATIVE: accept one conductor, serve them until they leave, then accept the next. */
function runIterative($server): void
{
    global $shuttingDown;
    while (!$shuttingDown) {
        $conn = @socket_accept($server);
        if ($conn === false) {
            continue;                    // interrupted by a signal
        }
        serveClient($conn);              // everyone else waits in the listen() queue meanwhile
    }
}

/** CONCURRENT: the parent only accepts; every conductor gets their own child process. */
function runForkPerClient($server): void
{
    global $children, $shuttingDown;
    while (!$shuttingDown) {
        // accept() returns the CONNECTED socket for this conductor; $server stays the LISTENING socket
        $conn = @socket_accept($server);
        if ($conn === false) {
            continue;                    // interrupted by a signal (a child finished, or Ctrl+C)
        }

        if (count($children) >= MAX_CLIENTS) {          // SECURITY: limit on processes too
            sendLine($conn, 'BYE | Server busy, try again shortly');
            plog(peer($conn) . ' refused: server full');
            socket_close($conn);
            continue;
        }

        $peer = peer($conn);
        $pid = pcntl_fork();             // from here on, TWO processes run this code

        if ($pid === -1) {               // fork failed (e.g. out of memory or process limit)
            sendLine($conn, 'BYE | Server cannot take more conductors right now');
            plog("fork() failed for $peer");
            socket_close($conn);
            continue;
        }

        if ($pid === 0) {
            // ---------------- CHILD: fork() returned 0
            resetChildSignals();
            socket_close($server);       // the child never accepts: only the parent listens
            serveClient($conn);
            exit(0);                     // the parent's SIGCHLD handler collects this exit
        }

        // ---------------- PARENT: fork() returned the child's process ID
        $children[$pid] = $peer;
        socket_close($conn);             // the child has its own copy of the connected socket
        plog("forked child $pid for $peer  (" . count($children) . ' conductor(s) connected)');
    }
}

/** PRE-FORKED: start N workers once; each worker accepts and serves conductors in a loop. */
function runPrefork($server, int $workers): void
{
    global $children, $shuttingDown;
    $startWorker = function () use ($server, &$children) {
        $pid = pcntl_fork();
        if ($pid === -1) {
            plog('fork() failed while starting a worker');
            return;
        }
        if ($pid === 0) {
            resetChildSignals();
            while (true) {               // all workers wait in accept() on the SAME listening socket;
                $conn = @socket_accept($server);   // the operating system gives each new conductor to one of them
                if ($conn !== false) {
                    serveClient($conn);
                }
            }
        }
        $children[$pid] = 'worker';
        plog("started worker $pid");
    };

    for ($i = 0; $i < $workers; $i++) {
        $startWorker();
    }
    while (!$shuttingDown) {
        sleep(1);                        // woken early by signals
        // Replace any worker that crashed, so there are always N ready to serve
        for ($i = count($children); $i < $workers && !$shuttingDown; $i++) {
            $startWorker();
        }
    }
}

// ==================================================================== serving one conductor

/**
 * Serve ONE conductor until they QUIT, go idle, or break a security rule.
 * In fork mode this runs in the child process, so a slow conductor never holds up the others.
 */
function serveClient($conn): void
{
    global $pdo;
    $pdo = openDatabase();               // this process's own database connection

    $peer = peer($conn);
    $state = ['loggedIn' => false, 'lastActive' => time(), 'loginTries' => 0, 'badRefs' => 0];
    $buffer = '';
    plog("$peer connected");
    sendLine($conn, 'WELCOME | Uganda Bus ticket check | Log in first: LOGIN <pin>');

    while (true) {
        // SECURITY: the same idle limits as ticket_server.php
        $limit = $state['loggedIn'] ? IDLE_TIMEOUT : LOGIN_TIMEOUT;
        $remaining = $limit - (time() - $state['lastActive']);
        if ($remaining <= 0) {
            sendLine($conn, 'BYE | Disconnected: idle for too long');
            break;
        }

        // Wait for this one conductor's next message (or the idle limit)
        $read = [$conn];
        $write = $except = null;
        $ready = @socket_select($read, $write, $except, $remaining);
        if ($ready === false) {
            if (socket_last_error() === SOCKET_EINTR) {
                socket_clear_error();
                continue;                // a signal arrived; keep serving
            }
            break;
        }
        if ($ready === 0) {
            continue;                    // timed out: the check at the top disconnects
        }

        $data = @socket_read($conn, MAX_LINE, PHP_BINARY_READ);
        if ($data === false || $data === '') {
            break;                       // conductor closed the connection
        }
        $state['lastActive'] = time();
        $buffer .= $data;
        if (strlen($buffer) > MAX_LINE * 4) {
            sendLine($conn, 'BYE | Line too long');
            break;
        }

        while (($pos = strpos($buffer, "\n")) !== false) {
            $line = trim(substr($buffer, 0, $pos));
            $buffer = substr($buffer, $pos + 1);
            if ($line === '') {
                continue;
            }
            $reply = handleCommand($line, $peer, $state);
            $logged = preg_match('/^login\b/i', $line) ? 'LOGIN ****' : $line;   // never log the PIN
            plog("$peer > $logged  =>  $reply");
            sendLine($conn, $reply);
            if (str_starts_with($reply, 'BYE')) {
                break 2;
            }
        }
    }

    socket_close($conn);
    plog("$peer disconnected");
}

// ==================================================================== helpers

/** A new SQLite connection with the same settings as backend/api/config.php. */
function openDatabase(): PDO
{
    global $dbFile;                      // set by config.php
    $db = new PDO('sqlite:' . $dbFile);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $db->setAttribute(PDO::ATTR_TIMEOUT, 5);
    $db->exec('PRAGMA busy_timeout = 5000');   // wait for another process's write instead of failing
    return $db;
}

/** A child does not inherit the parent's job: give it normal signal behaviour back. */
function resetChildSignals(): void
{
    global $children;
    $children = [];
    pcntl_signal(SIGCHLD, SIG_DFL);
    pcntl_signal(SIGTERM, SIG_DFL);
    pcntl_signal(SIGINT, SIG_DFL);
}

/**
 * Stop accepting. Conductors in the middle of a check get up to 5 s to finish (fork mode);
 * then every child still running is asked to stop (SIGTERM), and forced (SIGKILL) if needed.
 */
function shutdown($server): void
{
    global $children, $mode;
    socket_close($server);
    if ($children) {
        plog('Stopping: ' . count($children) . ' child process(es) still running...');
        $deadline = time() + ($mode === 'prefork' ? 0 : 5);   // pre-forked workers never finish by themselves
        while ($children && time() < $deadline) {
            reapChildren();
            usleep(100000);
        }
        foreach (array_keys($children) as $pid) {
            posix_kill($pid, SIGTERM);
        }
        $deadline = time() + 2;
        while ($children && time() < $deadline) {
            reapChildren();
            usleep(100000);
        }
        foreach (array_keys($children) as $pid) {
            posix_kill($pid, SIGKILL);
        }
        reapChildren();
    }
    plog('Server stopped');
}

/** Log line that shows which process wrote it. */
function plog(string $text): void
{
    logLine('[pid ' . getmypid() . "] $text");
}
