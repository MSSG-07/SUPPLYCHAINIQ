"""Initialize a hosted libSQL database once before deployment."""

from __future__ import annotations

import argparse

from .main import ROOT, connect, seed_demo


def main() -> None:
    parser = argparse.ArgumentParser(description="Create SupplyChainIQ tables, views and triggers")
    parser.add_argument("--seed", action="store_true", help="insert sample data into an empty database")
    args = parser.parse_args()

    conn = connect()
    try:
        conn.executescript((ROOT / "schema.sql").read_text())
        if args.seed:
            seed_demo(conn)
        print("Database initialized")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
