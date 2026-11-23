# Ticket Check Socket Server (TCP)

Conductors at the bus station connect to this TCP server and check passenger
tickets by booking reference. It uses the same SQLite database as the website
(`backend/api/data/bus_system.sqlite`), so a booking made online can be checked
at the station straight away.

| File                   | Role                                         | Socket calls used                                                                                                   |
| ---------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `ticket_server.php`    | Server: waits for conductors, checks tickets | `socket_create` → `socket_bind` → `socket_listen` → `socket_accept` → `socket_read`/`socket_write` → `socket_close` |
| `conductor_client.php` | Client: used by a conductor                  | `socket_create` → `socket_connect` → `socket_write`/`socket_read` → `socket_close`                                  |
| `ticket_server_fork.php` | Concurrent server using `fork()` (Ronnie) | same as `ticket_server.php`, plus `pcntl_fork` → `pcntl_waitpid`                                                  |
| `ticket_protocol.php`  | Shared commands, replies and security rules used by both servers | –                                                                                              |
| `load_test.php`        | Connects many conductors at once and times them | `stream_socket_client` + `stream_select`                                                                     |

- **Transport:** TCP stream socket (`AF_INET`, `SOCK_STREAM`), port **5050**.
- **Concurrency:** two servers, same protocol. `ticket_server.php` uses `socket_select()`: one process serves many conductors (works on Windows). `ticket_server_fork.php` uses `fork()`: one process per conductor (Linux, macOS, WSL, Docker). See [Concurrent server with fork()](#concurrent-server-with-fork).
- **Check-ins** are saved in a new table `ticket_checks`, which the server creates itself. No existing table or file is changed.

## Run (Windows / XAMPP)

From the `uganda_Bus` folder:

```bash
# 1. once: the database must exist
D:\xampp\php\php.exe php-rebuild\backend\api\init_db.php

# 2. terminal 1 - start the server (Ctrl+C to stop); it asks you to set the conductor PIN
D:\xampp\php\php.exe php-rebuild\socket_server\ticket_server.php

# 3. terminal 2 (or another PC on the same network) - a conductor; it asks for the PIN
D:\xampp\php\php.exe php-rebuild\socket_server\conductor_client.php 127.0.0.1 5050
```

To skip the PIN question, set it first in PowerShell: `$env:TICKET_PIN="4821"`.
To listen on the station network only, give its IP: `ticket_server.php 5050 192.168.1.10`.

`telnet <server-ip> 5050`, or PuTTY with connection type **Raw**, also work as a client.

If you see "sockets extension is off", open `D:\xampp\php\php.ini`, remove the `;` in front of
`extension=sockets`, and run the command again. If Windows Firewall asks, allow PHP on
private networks so conductors on other PCs can connect.

## Protocol

One command per line, one reply line per command.

| Command       | What it does                                                                                         |
| ------------- | ---------------------------------------------------------------------------------------------------- |
| `LOGIN <pin>` | Logs in as a conductor. Required before `CHECK` and `BOARD`.                                         |
| `CHECK <ref>` | Looks the ticket up. Changes nothing.                                                                |
| `BOARD <ref>` | Lets the passenger board and records the check-in. Works **once** per ticket (database transaction). |
| `HELP`        | Lists the commands.                                                                                  |
| `QUIT`        | Disconnects.                                                                                         |

`<ref>` can be the booking reference (`UG-KT-4821-QB`, any letter case) or the full text read from the receipt QR code.

| Reply       | Meaning                                        |
| ----------- | ---------------------------------------------- |
| `OK`        | Logged in                                      |
| `VALID`     | Real ticket, not used yet                      |
| `BOARDED`   | Check-in saved, the passenger may board        |
| `USED`      | Ticket already used, with the time it was used |
| `INVALID`   | No such booking, or not a booking reference    |
| `EXPIRED`   | The trip date has passed                       |
| `WRONG_DAY` | The ticket is for a later day (BOARD only)     |
| `ERROR`     | Bad command or a server problem                |

Example:

```
Conductor PIN: ****
OK | Logged in. Commands: CHECK <ref>, BOARD <ref>, QUIT
conductor> CHECK UG-KT-4821-QB
VALID | UG-KT-4821-QB | John Doe | Kampala -> Jinja | 2026-11-16 23:30 | Bus UBB-1003 | Seats 1A,1B | PAID
conductor> BOARD UG-KT-4821-QB
BOARDED | UG-KT-4821-QB | John Doe | Kampala -> Jinja | 2026-11-16 23:30 | Bus UBB-1003 | Seats 1A,1B | PAID
conductor> BOARD UG-KT-4821-QB
USED | Already boarded at 2026-11-16 19:23:40 | UG-KT-4821-QB | John Doe | ...
```

For a "pay at station" booking, the reply ends with `COLLECT CASH UGX ...`.

## Security

| Protection                         | Setting                                          | Stops                                                 |
| ---------------------------------- | ------------------------------------------------ | ----------------------------------------------------- |
| PIN login before `CHECK` / `BOARD` | `LOGIN <pin>`                                    | Strangers on the network checking or boarding tickets |
| Lock-out after wrong PINs          | 3 tries, then disconnected                       | Guessing the PIN                                      |
| Idle timeout                       | 30 s before login, 2 min after                   | Clients holding connections open forever              |
| Connection limit                   | 20 conductors at once                            | Flooding the server with connections                  |
| Guessing limit                     | 5 invalid references in a row, then disconnected | Scripts trying thousands of references                |
| Line length limit                  | 4 KB                                             | Flooding the server's memory                          |
| PIN never written to the log       | shown as `LOGIN ****`                            | Leaking the PIN                                       |
| Prepared SQL statements            | `?` placeholders                                 | SQL injection                                         |
| Transaction + UNIQUE check-in      | `BOARD`                                          | Using one ticket twice                                |

The settings are constants at the top of `ticket_server.php`.
Not covered: traffic is plain TCP, not encrypted. Use it on a trusted station network; TLS is future work.

## Concurrent server with fork()

`ticket_server_fork.php` serves the **same protocol** as `ticket_server.php`, with the same PIN,
limits and replies, but uses the technique from the *fork* lecture: the **parent** process keeps
the **listening socket** and only accepts; for every conductor it calls `fork()`, and the **child**
process serves that conductor on its **connected socket**.

```
listening socket :5050  (parent, pid 421)
    |  accept()
    +-- fork() --> child pid 424 --- connected socket --- conductor A
    +-- fork() --> child pid 425 --- connected socket --- conductor B
    +-- fork() --> child pid 426 --- connected socket --- conductor C
```

### Run (Linux, macOS, WSL or Docker)

`fork()` does not exist on Windows. On Windows use `ticket_server.php`, or run this in WSL/Docker.

```bash
# needs the sockets and pcntl extensions: php -m | grep -E "sockets|pcntl"
TICKET_PIN=4821 php php-rebuild/socket_server/ticket_server_fork.php 5051             # fork per conductor
TICKET_PIN=4821 php php-rebuild/socket_server/ticket_server_fork.php 5051 --iterative # one at a time
TICKET_PIN=4821 php php-rebuild/socket_server/ticket_server_fork.php 5051 --prefork=4 # 4 workers started up front
```

Clients are the same: `conductor_client.php 127.0.0.1 5051`, `telnet` or PuTTY.

Watch the processes while conductors are connected (`PPID` of each child = the parent's PID):

```bash
ps -o pid,ppid,stat,cmd -C php
```

### What the code does (fork.pdf)

| Lecture point | In `ticket_server_fork.php` |
| --- | --- |
| `fork()` returns 0 in the child, the child's PID in the parent, -1 on error | `$pid = pcntl_fork()` and the three branches after it |
| Parent keeps listening, child serves the client | Child closes the listening socket; parent closes its copy of the connected socket |
| Listening socket vs connected socket | `$server` (from `socket_listen`) vs `$conn` (from `socket_accept`) |
| Parent records its children | `$children[$pid] = 'ip:port'` |
| Harvest zombies with `waitpid()` | `SIGCHLD` handler calls `pcntl_waitpid(-1, $status, WNOHANG)` in a loop |
| Iterative server | `--iterative`: serve one conductor, then accept the next |
| Pre-forking a fixed number of children | `--prefork=N`: N workers all `accept()` on the same socket; a crashed worker is replaced |

Also: every process opens **its own database connection** (`openDatabase()`), because one SQLite
connection must never be shared between processes. The connection limit (20) counts child processes,
idle conductors are disconnected inside the child, and Ctrl+C / `kill` gives connected conductors
5 seconds before the children are stopped.

### Comparing the servers

Start a server with a **demo delay** so every ticket check takes 1 second, then connect 5 conductors at once:

```bash
TICKET_DEMO_DELAY_MS=1000 TICKET_PIN=4821 php php-rebuild/socket_server/ticket_server_fork.php 5051
php php-rebuild/socket_server/load_test.php --port=5051 --clients=5 --refs=UG-AB-1234-CD,UG-EF-5678-GH
```

Measured on our code (5 conductors, 1 s per check):

| Server | All 5 done in | Why |
| --- | --- | --- |
| `--iterative` | 5.0 s | One conductor at a time; the 5th waits 5 s |
| `ticket_server.php` (select) | 5.0 s | One process: while it is busy with one check, nobody else is served |
| `ticket_server_fork.php` (fork) | **1.0 s** | Each conductor has their own process, so the checks run in parallel |
| `--prefork=3` | 2.0 s | 3 conductors at once; 2 wait for a free worker |

`select()` is excellent when the work per message is tiny (it uses one process and little memory),
but one slow request holds everyone up. `fork()` isolates conductors from each other, at the cost
of one process each. `TICKET_DEMO_DELAY_MS` is for demonstrations only; never set it in real use.

### Race test: many conductors board the same ticket

```bash
php php-rebuild/socket_server/load_test.php --port=5051 --clients=10 --board=UG-AB-1234-CD
```

Expected: `1 x BOARDED, 9 x USED`. With several processes, `BOARD` starts its transaction with
`BEGIN IMMEDIATE`, which takes SQLite's write lock first, so the processes take turns and each one sees
the result of the one before. (With a plain `BEGIN`, the first test gave `1 x BOARDED, 9 x ERROR:
database is locked`.) The `UNIQUE` rule on `booking_ref` is a second safety net.
