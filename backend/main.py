"""SupplyChainIQ API. SQLite is the source of truth for stock and constraints."""

from __future__ import annotations

import os
import sqlite3
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

ROOT = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("SUPPLYCHAINIQ_DB", ROOT / "supplychainiq.db"))

TABLES = {
    "supplier": "supplier_id",
    "supplier_contact": "contact_id",
    "warehouse": "warehouse_id",
    "employee": "employee_id",
    "category": "category_id",
    "product": "product_id",
    "customer": "customer_id",
    "purchase_order": "po_id",
    "purchase_order_item": "po_id,line_no",
    "inventory": "inventory_id",
    "stock_movement": "movement_id",
    "supplier_performance": "perf_id",
    "sales_order": "so_id",
    "sales_order_item": "so_id,line_no",
    "shipment": "shipment_id",
    "delivery": "delivery_id",
    "return": "return_id",
}
WORKFLOW_TABLES = {"inventory", "stock_movement", "shipment", "delivery", "return"}
ORDER_TABLES = {"purchase_order": "po_id", "sales_order": "so_id"}
ITEM_PARENT = {"purchase_order_item": ("purchase_order", "po_id"), "sales_order_item": ("sales_order", "so_id")}


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 10000")
    return conn


def rowdict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(row) if row else None


def fail_if_missing(row: sqlite3.Row | None, label: str = "Record") -> sqlite3.Row:
    if row is None:
        raise HTTPException(404, f"{label} not found")
    return row


def db_error(error: sqlite3.Error) -> HTTPException:
    message = str(error)
    if "FOREIGN KEY" in message:
        message = "This record is referenced elsewhere or a related record does not exist"
    return HTTPException(409, message)


def seed_demo(conn: sqlite3.Connection) -> None:
    if conn.execute("SELECT COUNT(*) FROM supplier").fetchone()[0]:
        return
    with conn:
        conn.executemany("INSERT INTO category(name) VALUES (?)", [("Electronics",), ("Packaging",), ("Components",)])
        conn.executemany("INSERT INTO warehouse(name,capacity) VALUES (?,?)", [("North Hub", 2500), ("South Hub", 1800), ("Central Depot", 3200)])
        conn.executemany("INSERT INTO employee(name,role,warehouse_id) VALUES (?,?,?)", [
            ("Aarav Mehta", "Procurement Manager", 1), ("Diya Shah", "Sales Coordinator", 2),
            ("Rohan Iyer", "Warehouse Lead", 3)])
        conn.executemany("INSERT INTO supplier(name,street,city,state,country) VALUES (?,?,?,?,?)", [
            ("Nova Components", "42 Industrial Rd", "Pune", "Maharashtra", "India"),
            ("BluePeak Supply", "18 Trade Park", "Bengaluru", "Karnataka", "India"),
            ("Vertex Distribution", "7 Logistics Ave", "Mumbai", "Maharashtra", "India")])
        conn.executemany("INSERT INTO supplier_contact(supplier_id,phone) VALUES (?,?)", [
            (1, "+91 98765 42010"), (1, "+91 98765 42011"), (2, "+91 98765 43020"), (3, "+91 98765 44030")])
        conn.executemany("INSERT INTO customer(name,email) VALUES (?,?)", [
            ("Atlas Retail", "orders@atlasretail.in"), ("Orbit Systems", "supply@orbitsystems.in"),
            ("Kite Commerce", "ops@kitecommerce.in")])
        conn.executemany("INSERT INTO product(product_name,category_id,unit_price,reorder_level) VALUES (?,?,?,?)", [
            ("Wireless Scanner", 1, 3499, 20), ("Thermal Label Roll", 2, 249, 40),
            ("RFID Sensor", 3, 1299, 25), ("Industrial Router", 1, 8999, 12),
            ("Protective Carton", 2, 89, 100), ("Power Module", 3, 1799, 30)])
        conn.executemany("INSERT INTO purchase_order(supplier_id,employee_id,order_date,status) VALUES (?,?,date('now',?),?)", [
            (1, 1, '-12 days', 'RECEIVED'), (2, 1, '-8 days', 'RECEIVED'), (3, 1, '-2 days', 'OPEN')])
        conn.executemany("INSERT INTO purchase_order_item(po_id,line_no,product_id,quantity,unit_cost) VALUES (?,?,?,?,?)", [
            (1, 1, 1, 70, 2400), (1, 2, 3, 60, 870), (1, 3, 6, 70, 1200),
            (2, 1, 2, 180, 150), (2, 2, 5, 240, 55), (2, 3, 4, 25, 6400),
            (3, 1, 3, 80, 880), (3, 2, 6, 50, 1180)])
        conn.executemany("INSERT INTO stock_movement(warehouse_id,product_id,movement_type,quantity,movement_date,reference_type,reference_id,note) VALUES (?,?,?,?,datetime('now',?),?,?,?)", [
            (1, 1, 'RECEIPT', 70, '-12 days', 'PO', 1, 'Opening receipt'),
            (1, 3, 'RECEIPT', 60, '-12 days', 'PO', 1, 'Opening receipt'),
            (1, 6, 'RECEIPT', 70, '-12 days', 'PO', 1, 'Opening receipt'),
            (2, 2, 'RECEIPT', 180, '-8 days', 'PO', 2, 'Opening receipt'),
            (2, 5, 'RECEIPT', 240, '-8 days', 'PO', 2, 'Opening receipt'),
            (2, 4, 'RECEIPT', 25, '-8 days', 'PO', 2, 'Opening receipt'),
            (3, 1, 'ADJUSTMENT_IN', 15, '-6 days', 'ADJUSTMENT', None, 'Opening balance'),
            (3, 2, 'ADJUSTMENT_IN', 30, '-6 days', 'ADJUSTMENT', None, 'Opening balance')])
        conn.executemany("INSERT INTO sales_order(customer_id,employee_id,order_date,status) VALUES (?,?,date('now',?),?)", [
            (1, 2, '-5 days', 'DELIVERED'), (2, 2, '-3 days', 'SHIPPED'), (3, 2, '-1 day', 'OPEN')])
        conn.executemany("INSERT INTO sales_order_item(so_id,line_no,product_id,quantity,unit_price) VALUES (?,?,?,?,?)", [
            (1, 1, 1, 12, 3499), (1, 2, 3, 10, 1299), (2, 1, 2, 145, 249),
            (2, 2, 4, 18, 8999), (3, 1, 6, 20, 1799)])
        conn.executemany("INSERT INTO shipment(so_id,warehouse_id,ship_date) VALUES (?,?,date('now',?))", [
            (1, 1, '-4 days'), (2, 2, '-2 days')])
        conn.executemany("INSERT INTO stock_movement(warehouse_id,product_id,movement_type,quantity,movement_date,reference_type,reference_id,note) VALUES (?,?,?,?,datetime('now',?),?,?,?)", [
            (1, 1, 'SALE', 12, '-4 days', 'SO', 1, 'Order shipped'),
            (1, 3, 'SALE', 10, '-4 days', 'SO', 1, 'Order shipped'),
            (2, 2, 'SALE', 145, '-2 days', 'SO', 2, 'Order shipped'),
            (2, 4, 'SALE', 18, '-2 days', 'SO', 2, 'Order shipped')])
        conn.executemany("INSERT INTO delivery(shipment_id,delivery_date,status) VALUES (?,date('now',?),?)", [
            (1, '-2 days', 'DELIVERED'), (2, '-1 day', 'IN_TRANSIT')])
        conn.executemany("INSERT INTO supplier_performance(supplier_id,employee_id,score,evaluated_at,notes) VALUES (?,?,?,date('now',?),?)", [
            (1, 1, 5, '-3 days', 'On-time, consistent quality'),
            (2, 1, 4, '-4 days', 'Good fill rate'), (3, 1, 3, '-1 day', 'Awaiting current PO')])


@asynccontextmanager
async def lifespan(_: FastAPI):
    conn = connect()
    try:
        conn.executescript((ROOT / "schema.sql").read_text())
        seed_demo(conn)
    finally:
        conn.close()
    yield


app = FastAPI(title="SupplyChainIQ API", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


@app.get("/api/health")
def health():
    return {"status": "ok", "database": "SQLite"}


@app.get("/api/meta")
def metadata():
    conn = connect()
    try:
        result = {}
        for table, key in TABLES.items():
            fields = [dict(row) for row in conn.execute(f'PRAGMA table_info("{table}")')]
            refs = {row["from"]: row["table"] for row in conn.execute(f'PRAGMA foreign_key_list("{table}")')}
            result[table] = {"key": key.split(","), "fields": fields, "references": refs, "workflow": table in WORKFLOW_TABLES}
        return result
    finally:
        conn.close()


def check_table(table: str, writable: bool = False) -> None:
    if table not in TABLES:
        raise HTTPException(404, "Unknown entity")
    if writable and table in WORKFLOW_TABLES:
        raise HTTPException(403, "Use the workflow endpoint for this entity")


def columns(conn: sqlite3.Connection, table: str) -> set[str]:
    return {row["name"] for row in conn.execute(f'PRAGMA table_info("{table}")')}


def key_where(table: str, row_id: str) -> tuple[str, list[int]]:
    keys = TABLES[table].split(",")
    parts = row_id.split(":")
    if len(keys) != len(parts):
        raise HTTPException(400, "Invalid record key")
    try:
        values = [int(part) for part in parts]
    except ValueError as exc:
        raise HTTPException(400, "Record key must be numeric") from exc
    return " AND ".join(f'"{key}" = ?' for key in keys), values


def ensure_editable(conn: sqlite3.Connection, table: str, data: dict[str, Any], row_id: str | None = None) -> None:
    if table in ITEM_PARENT:
        parent, key = ITEM_PARENT[table]
        parent_id = data.get(key)
        if parent_id is None and row_id:
            parent_id = int(row_id.split(":")[0])
        row = conn.execute(f'SELECT status FROM "{parent}" WHERE "{key}" = ?', (parent_id,)).fetchone()
        if row and row["status"] != "OPEN":
            raise HTTPException(409, "Items on a processed order cannot be changed")
    if table in ORDER_TABLES:
        if row_id:
            row = conn.execute(f'SELECT status FROM "{table}" WHERE "{ORDER_TABLES[table]}" = ?', (int(row_id),)).fetchone()
            if row and row["status"] != "OPEN":
                raise HTTPException(409, "Processed orders cannot be changed")
        if data.get("status", "OPEN") != "OPEN":
            raise HTTPException(409, "Order status is changed by a workflow")


@app.get("/api/data/{table}")
def list_records(table: str):
    check_table(table)
    conn = connect()
    try:
        order = TABLES[table].split(",")[0]
        query = f'SELECT * FROM "{table}" ORDER BY "{order}" DESC LIMIT 500'
        rows = [dict(row) for row in conn.execute(query)]
        if table == "purchase_order":
            totals = {row["po_id"]: row["total"] for row in conn.execute("SELECT po_id, ROUND(SUM(quantity * unit_cost), 2) total FROM purchase_order_item GROUP BY po_id")}
            for row in rows: row["total_cost"] = totals.get(row["po_id"], 0)
        if table == "sales_order":
            totals = {row["so_id"]: row["total"] for row in conn.execute("SELECT so_id, ROUND(SUM(quantity * unit_price), 2) total FROM sales_order_item GROUP BY so_id")}
            for row in rows: row["total_amount"] = totals.get(row["so_id"], 0)
        return rows
    finally:
        conn.close()


@app.post("/api/data/{table}", status_code=201)
def create_record(table: str, data: dict[str, Any]):
    check_table(table, True)
    conn = connect()
    try:
        allowed = columns(conn, table) - set(TABLES[table].split(","))
        if table in ITEM_PARENT:
            allowed |= set(TABLES[table].split(","))
        payload = {key: value for key, value in data.items() if key in allowed and value != ""}
        if not payload or set(data) - allowed:
            raise HTTPException(400, "Invalid or empty fields")
        ensure_editable(conn, table, payload)
        names = ", ".join(f'"{key}"' for key in payload)
        marks = ", ".join("?" for _ in payload)
        with conn:
            cursor = conn.execute(f'INSERT INTO "{table}" ({names}) VALUES ({marks})', list(payload.values()))
        return {"id": cursor.lastrowid, "message": "Created"}
    except sqlite3.Error as exc:
        raise db_error(exc) from exc
    finally:
        conn.close()


@app.patch("/api/data/{table}/{row_id}")
def update_record(table: str, row_id: str, data: dict[str, Any]):
    check_table(table, True)
    conn = connect()
    try:
        allowed = columns(conn, table) - set(TABLES[table].split(","))
        if not data or set(data) - allowed:
            raise HTTPException(400, "Invalid or empty fields")
        ensure_editable(conn, table, data, row_id)
        where, values = key_where(table, row_id)
        assignments = ", ".join(f'"{key}" = ?' for key in data)
        with conn:
            cursor = conn.execute(f'UPDATE "{table}" SET {assignments} WHERE {where}', [*data.values(), *values])
        if not cursor.rowcount:
            raise HTTPException(404, "Record not found")
        return {"message": "Updated"}
    except sqlite3.Error as exc:
        raise db_error(exc) from exc
    finally:
        conn.close()


@app.delete("/api/data/{table}/{row_id}")
def delete_record(table: str, row_id: str):
    check_table(table, True)
    conn = connect()
    try:
        where, values = key_where(table, row_id)
        ensure_editable(conn, table, {}, row_id)
        with conn:
            cursor = conn.execute(f'DELETE FROM "{table}" WHERE {where}', values)
        if not cursor.rowcount:
            raise HTTPException(404, "Record not found")
        return {"message": "Deleted"}
    except sqlite3.Error as exc:
        raise db_error(exc) from exc
    finally:
        conn.close()


def positive_int(data: dict[str, Any], key: str) -> int:
    try:
        value = int(data[key])
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(400, f"{key} must be a positive integer") from exc
    if value <= 0:
        raise HTTPException(400, f"{key} must be a positive integer")
    return value


@app.post("/api/purchase-orders/{po_id}/receive")
def receive_purchase_order(po_id: int, data: dict[str, Any]):
    warehouse_id = positive_int(data, "warehouse_id")
    conn = connect()
    try:
        with conn:
            order = fail_if_missing(conn.execute("SELECT * FROM purchase_order WHERE po_id = ?", (po_id,)).fetchone(), "Purchase order")
            if order["status"] != "OPEN": raise HTTPException(409, "Purchase order already received")
            items = conn.execute("SELECT * FROM purchase_order_item WHERE po_id = ?", (po_id,)).fetchall()
            if not items: raise HTTPException(409, "Add order items before receiving")
            for item in items:
                conn.execute("INSERT INTO stock_movement(warehouse_id,product_id,movement_type,quantity,reference_type,reference_id,note) VALUES (?,?, 'RECEIPT',?, 'PO',?,?)",
                             (warehouse_id, item["product_id"], item["quantity"], po_id, f"PO #{po_id} line {item['line_no']}"))
            conn.execute("UPDATE purchase_order SET status = 'RECEIVED' WHERE po_id = ?", (po_id,))
        return {"message": "Purchase order received", "items": len(items)}
    except sqlite3.Error as exc:
        raise db_error(exc) from exc
    finally: conn.close()


@app.post("/api/sales-orders/{so_id}/ship")
def ship_sales_order(so_id: int, data: dict[str, Any]):
    warehouse_id = positive_int(data, "warehouse_id")
    conn = connect()
    try:
        with conn:
            order = fail_if_missing(conn.execute("SELECT * FROM sales_order WHERE so_id = ?", (so_id,)).fetchone(), "Sales order")
            if order["status"] != "OPEN": raise HTTPException(409, "Sales order already shipped")
            items = conn.execute("SELECT * FROM sales_order_item WHERE so_id = ?", (so_id,)).fetchall()
            if not items: raise HTTPException(409, "Add order items before shipping")
            for item in items:
                available = conn.execute("SELECT quantity_on_hand FROM inventory WHERE warehouse_id = ? AND product_id = ?", (warehouse_id, item["product_id"])).fetchone()
                if not available or available[0] < item["quantity"]:
                    raise HTTPException(409, f"Insufficient stock for product #{item['product_id']}")
            cursor = conn.execute("INSERT INTO shipment(so_id,warehouse_id) VALUES (?,?)", (so_id, warehouse_id))
            for item in items:
                conn.execute("INSERT INTO stock_movement(warehouse_id,product_id,movement_type,quantity,reference_type,reference_id,note) VALUES (?,?,'SALE',?,'SO',?,?)",
                             (warehouse_id, item["product_id"], item["quantity"], so_id, f"SO #{so_id} line {item['line_no']}"))
            conn.execute("UPDATE sales_order SET status = 'SHIPPED' WHERE so_id = ?", (so_id,))
        return {"message": "Order shipped", "shipment_id": cursor.lastrowid}
    except sqlite3.Error as exc:
        raise db_error(exc) from exc
    finally: conn.close()


@app.post("/api/shipments/{shipment_id}/deliver")
def deliver_shipment(shipment_id: int, data: dict[str, Any]):
    status = data.get("status", "DELIVERED")
    if status not in {"IN_TRANSIT", "DELIVERED", "DELAYED", "FAILED"}:
        raise HTTPException(400, "Invalid delivery status")
    conn = connect()
    try:
        with conn:
            shipment = fail_if_missing(conn.execute("SELECT * FROM shipment WHERE shipment_id = ?", (shipment_id,)).fetchone(), "Shipment")
            existing = conn.execute("SELECT delivery_id FROM delivery WHERE shipment_id = ?", (shipment_id,)).fetchone()
            if existing:
                conn.execute("UPDATE delivery SET status = ?, delivery_date = date('now') WHERE shipment_id = ?", (status, shipment_id))
            else:
                conn.execute("INSERT INTO delivery(shipment_id,status) VALUES (?,?)", (shipment_id, status))
            conn.execute("UPDATE sales_order SET status = ? WHERE so_id = ?", ("DELIVERED" if status == "DELIVERED" else "SHIPPED", shipment["so_id"]))
        return {"message": "Delivery updated", "status": status}
    except sqlite3.Error as exc: raise db_error(exc) from exc
    finally: conn.close()


@app.post("/api/returns")
def create_return(data: dict[str, Any]):
    so_id, line_no, quantity = (positive_int(data, key) for key in ("so_id", "line_no", "quantity"))
    reason = str(data.get("reason", "")).strip()
    if not reason: raise HTTPException(400, "A return reason is required")
    conn = connect()
    try:
        with conn:
            item = fail_if_missing(conn.execute("SELECT * FROM sales_order_item WHERE so_id = ? AND line_no = ?", (so_id, line_no)).fetchone(), "Sales order item")
            shipment = fail_if_missing(conn.execute("SELECT * FROM shipment WHERE so_id = ?", (so_id,)).fetchone(), "Shipment")
            returned = conn.execute('SELECT COALESCE(SUM(quantity),0) FROM "return" WHERE so_id = ? AND line_no = ?', (so_id, line_no)).fetchone()[0]
            if returned + quantity > item["quantity"]: raise HTTPException(409, "Returned quantity exceeds sold quantity")
            cursor = conn.execute('INSERT INTO "return"(so_id,line_no,warehouse_id,quantity,reason) VALUES (?,?,?,?,?)',
                                  (so_id, line_no, shipment["warehouse_id"], quantity, reason))
            conn.execute("INSERT INTO stock_movement(warehouse_id,product_id,movement_type,quantity,reference_type,reference_id,note) VALUES (?,?,'RETURN',?,'RETURN',?,?)",
                         (shipment["warehouse_id"], item["product_id"], quantity, cursor.lastrowid, reason))
        return {"message": "Return recorded and stock restored", "return_id": cursor.lastrowid}
    except sqlite3.Error as exc: raise db_error(exc) from exc
    finally: conn.close()


@app.post("/api/stock/adjust")
def adjust_stock(data: dict[str, Any]):
    warehouse_id, product_id, quantity = (positive_int(data, key) for key in ("warehouse_id", "product_id", "quantity"))
    direction = data.get("direction")
    if direction not in {"IN", "OUT"}: raise HTTPException(400, "direction must be IN or OUT")
    conn = connect()
    try:
        with conn:
            conn.execute("INSERT INTO stock_movement(warehouse_id,product_id,movement_type,quantity,reference_type,note) VALUES (?,?,?,?, 'ADJUSTMENT',?)",
                         (warehouse_id, product_id, f"ADJUSTMENT_{direction}", quantity, str(data.get("note", "Manual adjustment"))))
        return {"message": "Stock adjusted"}
    except sqlite3.Error as exc: raise db_error(exc) from exc
    finally: conn.close()


@app.post("/api/stock/transfer")
def transfer_stock(data: dict[str, Any]):
    source, target, product_id, quantity = (positive_int(data, key) for key in ("source_warehouse_id", "target_warehouse_id", "product_id", "quantity"))
    if source == target: raise HTTPException(400, "Choose two different warehouses")
    conn = connect()
    try:
        with conn:
            note = f"Transfer {source} → {target}"
            conn.execute("INSERT INTO stock_movement(warehouse_id,product_id,movement_type,quantity,reference_type,note) VALUES (?,?,'TRANSFER_OUT',?,'TRANSFER',?)", (source, product_id, quantity, note))
            conn.execute("INSERT INTO stock_movement(warehouse_id,product_id,movement_type,quantity,reference_type,note) VALUES (?,?,'TRANSFER_IN',?,'TRANSFER',?)", (target, product_id, quantity, note))
        return {"message": "Stock transferred"}
    except sqlite3.Error as exc: raise db_error(exc) from exc
    finally: conn.close()


@app.get("/api/dashboard")
def dashboard():
    conn = connect()
    try:
        scalar = lambda sql: conn.execute(sql).fetchone()[0]
        metrics = {
            "products": scalar("SELECT COUNT(*) FROM product"),
            "stock_units": scalar("SELECT COALESCE(SUM(quantity_on_hand),0) FROM inventory"),
            "inventory_value": scalar("SELECT COALESCE(ROUND(SUM(i.quantity_on_hand * p.unit_price),2),0) FROM inventory i JOIN product p USING(product_id)"),
            "open_purchase_orders": scalar("SELECT COUNT(*) FROM purchase_order WHERE status='OPEN'"),
            "open_sales_orders": scalar("SELECT COUNT(*) FROM sales_order WHERE status='OPEN'"),
            "shipments": scalar("SELECT COUNT(*) FROM shipment"),
            "low_stock": scalar("SELECT COUNT(*) FROM inventory i JOIN product p USING(product_id) WHERE i.quantity_on_hand <= p.reorder_level"),
            "sales_value": scalar("SELECT COALESCE(ROUND(SUM(quantity * unit_price),2),0) FROM sales_order_item")
        }
        alerts = [dict(row) for row in conn.execute("SELECT p.product_name, p.reorder_level, i.quantity_on_hand, w.name warehouse, i.product_id, i.warehouse_id FROM inventory i JOIN product p USING(product_id) JOIN warehouse w USING(warehouse_id) WHERE i.quantity_on_hand <= p.reorder_level ORDER BY i.quantity_on_hand ASC LIMIT 8")]
        recent_orders = [dict(row) for row in conn.execute("SELECT s.so_id, c.name customer, s.order_date, s.status, COALESCE(ROUND(SUM(si.quantity * si.unit_price),2),0) total FROM sales_order s JOIN customer c USING(customer_id) LEFT JOIN sales_order_item si USING(so_id) GROUP BY s.so_id ORDER BY s.so_id DESC LIMIT 6")]
        movements = [dict(row) for row in conn.execute("SELECT m.movement_id,m.movement_type,m.quantity,m.movement_date,p.product_name,w.name warehouse FROM stock_movement m JOIN product p USING(product_id) JOIN warehouse w USING(warehouse_id) ORDER BY m.movement_id DESC LIMIT 7")]
        suppliers = [dict(row) for row in conn.execute("SELECT s.name, ROUND(AVG(sp.score),1) score, COUNT(sp.perf_id) evaluations FROM supplier s LEFT JOIN supplier_performance sp USING(supplier_id) GROUP BY s.supplier_id ORDER BY score DESC LIMIT 5")]
        return {"metrics": metrics, "alerts": alerts, "recent_orders": recent_orders, "movements": movements, "suppliers": suppliers}
    finally: conn.close()


@app.get("/api/insights")
def insights():
    conn = connect()
    try:
        inventory = [dict(row) for row in conn.execute("SELECT w.name warehouse,p.product_name,i.quantity_on_hand,p.reorder_level,ROUND(i.quantity_on_hand*p.unit_price,2) stock_value FROM inventory i JOIN warehouse w USING(warehouse_id) JOIN product p USING(product_id) ORDER BY stock_value DESC")]
        procurement = [dict(row) for row in conn.execute("SELECT s.name supplier, COUNT(DISTINCT po.po_id) orders, COALESCE(ROUND(SUM(pi.quantity*pi.unit_cost),2),0) spend, ROUND((SELECT AVG(score) FROM supplier_performance sp WHERE sp.supplier_id=s.supplier_id),1) score FROM supplier s LEFT JOIN purchase_order po USING(supplier_id) LEFT JOIN purchase_order_item pi USING(po_id) GROUP BY s.supplier_id ORDER BY spend DESC")]
        return {"inventory": inventory, "procurement": procurement}
    finally: conn.close()
