"""SQLite locally; a durable remote libSQL database on Vercel."""

from __future__ import annotations

import os
import sqlite3
from pathlib import Path
from typing import Any, Iterator
from urllib.parse import urlparse

import libsql

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "supplychainiq.db"

class LibsqlDatabaseError(Exception):
    pass


DB_ERRORS = (sqlite3.Error, libsql.Error, LibsqlDatabaseError)


class LibsqlRow:
    """Expose libSQL tuple rows with sqlite3.Row's name/index access."""

    def __init__(self, names: list[str], values: tuple[Any, ...]):
        self._names = names
        self._values = values

    def keys(self) -> list[str]:
        return self._names

    def __getitem__(self, key: str | int) -> Any:
        return self._values[self._names.index(key)] if isinstance(key, str) else self._values[key]


class LibsqlCursor:
    def __init__(self, cursor: libsql.Cursor):
        self._cursor = cursor

    @property
    def lastrowid(self) -> int | None:
        return self._cursor.lastrowid

    @property
    def rowcount(self) -> int:
        return self._cursor.rowcount

    def _row(self, values: tuple[Any, ...] | None) -> LibsqlRow | None:
        if values is None:
            return None
        names = [column[0] for column in (self._cursor.description or [])]
        return LibsqlRow(names, values)

    def fetchone(self) -> LibsqlRow | None:
        return self._row(self._cursor.fetchone())

    def fetchall(self) -> list[LibsqlRow]:
        return [self._row(values) for values in self._cursor.fetchall()]

    def __iter__(self) -> Iterator[LibsqlRow]:
        for values in self._cursor.fetchall():
            yield self._row(values)


class LibsqlConnection:
    def __init__(self, connection: libsql.Connection):
        self._connection = connection

    def execute(self, sql: str, params: Any = ()) -> LibsqlCursor:
        try:
            return LibsqlCursor(self._connection.execute(sql, params))
        except ValueError as exc:
            raise LibsqlDatabaseError(str(exc)) from exc

    def executemany(self, sql: str, params: Any) -> LibsqlCursor:
        try:
            return LibsqlCursor(self._connection.executemany(sql, params))
        except ValueError as exc:
            raise LibsqlDatabaseError(str(exc)) from exc

    def executescript(self, script: str) -> LibsqlCursor:
        try:
            return LibsqlCursor(self._connection.executescript(script))
        except ValueError as exc:
            raise LibsqlDatabaseError(str(exc)) from exc

    def close(self) -> None:
        self._connection.close()

    def __enter__(self) -> LibsqlConnection:
        self._connection.__enter__()
        return self

    def __exit__(self, *args: Any) -> Any:
        return self._connection.__exit__(*args)


def connect(db_path: Path | None = None) -> sqlite3.Connection | LibsqlConnection:
    url = os.environ.get("TURSO_DATABASE_URL")
    token = os.environ.get("TURSO_AUTH_TOKEN")
    if url or token:
        if not url or not token:
            raise RuntimeError("Set both TURSO_DATABASE_URL and TURSO_AUTH_TOKEN")
        parsed = urlparse(url)
        if parsed.scheme not in {"libsql", "https"} or not parsed.netloc:
            raise RuntimeError("TURSO_DATABASE_URL must be a hosted libsql:// or https:// URL")
        remote = LibsqlConnection(libsql.connect(database=url, auth_token=token))
        remote.execute("PRAGMA foreign_keys = ON")
        return remote
    if os.environ.get("VERCEL"):
        raise RuntimeError("Vercel requires TURSO_DATABASE_URL and TURSO_AUTH_TOKEN for durable storage")
    path = db_path or Path(os.environ.get("SUPPLYCHAINIQ_DB", DB_PATH))
    path.parent.mkdir(parents=True, exist_ok=True)
    local = sqlite3.connect(path, timeout=10)
    local.row_factory = sqlite3.Row
    local.execute("PRAGMA foreign_keys = ON")
    local.execute("PRAGMA busy_timeout = 10000")
    return local
