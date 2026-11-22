# Ticket Check Socket Server (TCP)

Conductors at the bus station connect to this TCP server and check passenger
tickets by booking reference. It uses the same SQLite database as the website
(`backend/api/data/bus_system.sqlite`), so a booking made online can be checked
at the station straight away.

| File                   | Role                                         | Socket calls used                                                                                                   |
| ---------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `ticket_server.php`    | Server: waits for conductors, checks tickets | `socket_create` → `socket_bind` → `socket_listen` → `socket_accept` → `socket_read`/`socket_write` → `socket_close` |
| `conductor_client.php` | Client: used by a conductor                  | `socket_create` → `socket_connect` → `socket_write`/`socket_read` → `socket_close`                                  |

- **Transport:** TCP stream socket (`AF_INET`, `SOCK_STREAM`), port **5050**.
- **Concurrency:** `socket_select()` lets one server process serve many conductors at the same time.
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
