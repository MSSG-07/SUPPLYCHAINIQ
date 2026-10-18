# SupplyChainIQ

A local supply chain management app built from the project ER diagram. It uses **SQLite**, **FastAPI**, and **Next.js**. The API has interactive documentation at `/docs`; the dashboard has overview, inventory, procurement, sales, distribution, analytics, and a data explorer.

## Run locally

Requires Python 3.11+ and Node.js 20.9+.

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn backend.main:app --reload --port 8000
```

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:3000**. The API docs are at **http://localhost:8000/docs**. A new database is created at `backend/supplychainiq.db` and populated with sample records on first run. Set `SUPPLYCHAINIQ_DB=/path/to/file.db` to use another SQLite file. Set `NEXT_PUBLIC_API_URL` before starting Next.js if the API is not at `http://localhost:8000`.

## What the database contains

The 16 ER entities are present: Supplier, Warehouse, Employee, Category, Product, Customer, Purchase Order, Purchase Order Item, Inventory, Stock Movement, Supplier Performance, Sales Order, Sales Order Item, Shipment, Delivery, and Return. `supplier_contact` is a supporting table for the diagram's multivalued contact numbers. Supplier address is split into street, city, state, and country. Order items use composite keys (`po_id, line_no` and `so_id, line_no`) to represent dependent entities.

Foreign keys, uniqueness rules, checks, and indexes are in [`backend/schema.sql`](backend/schema.sql). Four SQL views expose order totals, low stock, and supplier scores. Order totals are calculated from line items instead of stored. Stock movements form an append-only audit trail; a SQLite trigger updates Inventory and checks for negative stock or warehouse capacity overflow.

## Main workflows

1. Create a purchase order, add purchase order items in **Data explorer**, then click **Receive** and choose a warehouse. The transaction records receipt movements and increases stock.
2. Create a sales order, add sales order items, then click **Ship**. The system checks stock, creates a shipment, and deducts inventory in one transaction.
3. In **Distribution**, update the delivery status or record a return. Returns cannot exceed the sold quantity and restore stock to the shipment's warehouse.
4. Use **Adjust stock** or **Transfer stock** for manual inventory operations. Transfers roll back completely if the destination lacks capacity or the source lacks stock.

Inventory, stock movements, shipments, deliveries, and returns are managed through these workflows, so direct edits cannot quietly corrupt stock history. Master data, orders, line items, and supplier evaluations have create, read, update, and delete operations in **Data explorer**. Processed orders and their items are locked. Foreign keys prevent deleting referenced records.

SQLite has no stored procedures, so the multi-step operations run as database transactions in FastAPI. This is a local project setup; there is no authentication or multi-tenant separation.

## Checks

```bash
pip install -r requirements-dev.txt
python -m pytest -q backend/test_app.py
cd frontend && npm run build
```
