from pathlib import Path

import pytest
import libsql
from fastapi.testclient import TestClient

import backend.main as main
from backend.database import LibsqlConnection
from backend.database import connect as database_connect


@pytest.fixture(params=["sqlite", "libsql"])
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, request: pytest.FixtureRequest):
    monkeypatch.setattr(main, "DB_PATH", tmp_path / "test.db")
    if request.param == "libsql":
        def connect_libsql() -> LibsqlConnection:
            conn = LibsqlConnection(libsql.connect(database=str(main.DB_PATH)))
            conn.execute("PRAGMA foreign_keys = ON")
            return conn

        monkeypatch.setattr(main, "connect", connect_libsql)
        conn = connect_libsql()
        try:
            conn.executescript((main.ROOT / "schema.sql").read_text())
            main.seed_demo(conn)
        finally:
            conn.close()
    with TestClient(main.app) as test_client:
        yield test_client


def stock(client: TestClient, warehouse_id: int, product_id: int) -> int:
    return next(
        (row["quantity_on_hand"] for row in client.get("/api/data/inventory").json()
         if row["warehouse_id"] == warehouse_id and row["product_id"] == product_id),
        0,
    )


def test_receive_order_updates_stock_once_and_keeps_derived_total(client: TestClient):
    order = next(row for row in client.get("/api/data/purchase_order").json() if row["po_id"] == 3)
    assert order["total_cost"] == 80 * 880 + 50 * 1180
    before = stock(client, 3, 3)
    response = client.post("/api/purchase-orders/3/receive", json={"warehouse_id": 3})
    assert response.status_code == 200
    assert stock(client, 3, 3) == before + 80
    assert client.post("/api/purchase-orders/3/receive", json={"warehouse_id": 3}).status_code == 409
    assert stock(client, 3, 3) == before + 80


def test_transfer_is_atomic_and_sale_return_flow_is_consistent(client: TestClient):
    source_before = stock(client, 1, 6)
    too_many = client.post("/api/stock/transfer", json={
        "source_warehouse_id": 1, "target_warehouse_id": 2,
        "product_id": 6, "quantity": source_before + 1,
    })
    assert too_many.status_code == 409
    assert too_many.json()["detail"] == (
        f"Only {source_before} units of this product are available in the source warehouse"
    )
    assert stock(client, 1, 6) == source_before
    assert stock(client, 2, 6) == 0

    small = client.post("/api/data/warehouse", json={"name": "Tiny Depot", "capacity": 2})
    assert small.status_code == 201
    tiny_id = small.json()["id"]
    rejected = client.post("/api/stock/transfer", json={
        "source_warehouse_id": 1, "target_warehouse_id": tiny_id, "product_id": 6, "quantity": 3,
    })
    assert rejected.status_code == 409
    assert stock(client, 1, 6) == source_before
    assert stock(client, tiny_id, 6) == 0
    assert client.patch("/api/data/warehouse/1", json={"capacity": 1}).status_code == 409

    assert client.post("/api/stock/transfer", json={
        "source_warehouse_id": 1, "target_warehouse_id": 2, "product_id": 6, "quantity": 25,
    }).status_code == 200
    assert client.post("/api/sales-orders/3/ship", json={"warehouse_id": 2}).status_code == 200
    assert stock(client, 2, 6) == 5
    assert client.post("/api/sales-orders/3/ship", json={"warehouse_id": 2}).status_code == 409

    assert client.post("/api/returns", json={"so_id": 3, "line_no": 1, "quantity": 4, "reason": "Damaged carton"}).status_code == 200
    assert stock(client, 2, 6) == 9
    assert client.post("/api/returns", json={"so_id": 3, "line_no": 1, "quantity": 17, "reason": "Too many"}).status_code == 409
    assert stock(client, 2, 6) == 9


def test_supplier_contacts_are_separate_and_foreign_keys_protect_data(client: TestClient):
    supplier = client.post("/api/data/supplier", json={"name": "Test Supplier", "city": "Delhi"})
    assert supplier.status_code == 201
    supplier_id = supplier.json()["id"]
    assert client.post("/api/data/supplier_contact", json={"supplier_id": supplier_id, "phone": "+91 12345 67890"}).status_code == 201
    assert client.post("/api/data/supplier_contact", json={"supplier_id": supplier_id, "phone": "+91 12345 67890"}).status_code == 409
    assert client.delete(f"/api/data/supplier/{supplier_id}").status_code == 200
    assert all(row["supplier_id"] != supplier_id for row in client.get("/api/data/supplier_contact").json())


def test_api_docs_live_under_public_proxy_prefix(client: TestClient):
    spec = client.get("/api/openapi.json")
    assert spec.status_code == 200
    assert "/api/data/{table}" in spec.json()["paths"]
    docs = client.get("/api/docs")
    assert docs.status_code == 200
    assert "/api/openapi.json" in docs.text


def test_vercel_rejects_ephemeral_sqlite(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.delenv("TURSO_DATABASE_URL", raising=False)
    monkeypatch.delenv("TURSO_AUTH_TOKEN", raising=False)
    with pytest.raises(RuntimeError, match="durable storage"):
        database_connect()
    monkeypatch.setenv("TURSO_DATABASE_URL", "/tmp/not-durable.db")
    monkeypatch.setenv("TURSO_AUTH_TOKEN", "dummy")
    with pytest.raises(RuntimeError, match="hosted"):
        database_connect()
