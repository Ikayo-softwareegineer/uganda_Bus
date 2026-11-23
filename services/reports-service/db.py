"""
Database access for the reports service.

The lecture slides use mysql.connector.pooling.MySQLConnectionPool. Our system
stores its data in SQLite, so this file gives the same idea for SQLite:
a small pool of connections that are opened once and reused by every request,
instead of opening a new connection for each request.

Every connection is opened READ-ONLY (mode=ro). The PHP site owns the data;
the reports service only reads it, so a bug here can never change a booking.
"""

import queue
import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path


class DatabaseUnavailable(Exception):
    """The SQLite file is missing or cannot be opened."""


class SQLiteConnectionPool:
    """A fixed-size pool of read-only SQLite connections."""

    def __init__(self, db_path, pool_size=5, timeout=5.0):
        self.db_path = Path(db_path)
        self.pool_size = pool_size
        self.timeout = timeout
        self._pool = queue.Queue(maxsize=pool_size)
        self._created = 0
        self._lock = threading.Lock()  # two requests must not both open the "last" connection

    def _open(self):
        if not self.db_path.exists():
            raise DatabaseUnavailable(
                f"Database file not found: {self.db_path}. Open the PHP site once so it creates the database."
            )
        try:
            conn = sqlite3.connect(
                f"file:{self.db_path.as_posix()}?mode=ro",
                uri=True,
                timeout=self.timeout,
                check_same_thread=False,  # Flask may serve requests on different threads
            )
        except sqlite3.Error as error:
            raise DatabaseUnavailable(f"Cannot open the database: {error}") from error
        conn.row_factory = sqlite3.Row  # rows behave like dictionaries: row["origin"]
        return conn

    def _get(self):
        # Reuse a free connection; open a new one only while the pool is not full
        try:
            return self._pool.get_nowait()
        except queue.Empty:
            with self._lock:
                if self._created < self.pool_size:
                    conn = self._open()
                    self._created += 1
                    return conn
            # All connections are busy: wait for one to be returned
            try:
                return self._pool.get(timeout=self.timeout)
            except queue.Empty as error:
                raise DatabaseUnavailable("All database connections are busy. Try again.") from error

    def _put(self, conn):
        self._pool.put(conn)

    def _discard(self, conn):
        try:
            conn.close()
        except sqlite3.Error:
            pass
        with self._lock:
            self._created -= 1

    @contextmanager
    def connection(self):
        """Borrow a connection:  with pool.connection() as conn: ..."""
        conn = self._get()
        try:
            yield conn
        except sqlite3.DatabaseError:
            # A broken connection is closed instead of going back into the pool
            self._discard(conn)
            raise
        else:
            self._put(conn)

    def close_all(self):
        while True:
            try:
                self._pool.get_nowait().close()
            except queue.Empty:
                break
        with self._lock:
            self._created = 0

    @property
    def in_use(self):
        return self._created - self._pool.qsize()
