# SupplyChainIQ

A supply chain management app built from the project ER diagram. It uses **SQLite or hosted libSQL**, **FastAPI**, and **Next.js**. The dashboard has overview, inventory, procurement, sales, distribution, analytics, and a data explorer.

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
BACKEND_URL=http://localhost:8000 npm run dev
```

Open **http://localhost:3000**. The API docs are at **http://localhost:3000/docs** (also at `/api/docs`). A local database is created at `backend/supplychainiq.db` and populated with sample records on first run. Set `SUPPLYCHAINIQ_DB=/path/to/file.db` to use another local SQLite file. The Next.js API route reads `BACKEND_URL` at request time; the browser uses same-origin `/api` URLs.

## Vercel services deployment

The root [`vercel.json`](vercel.json) declares a public `frontend` Next.js service and a public `backend` FastAPI service. `/api/*` routes directly to FastAPI; other paths route to Next.js. The frontend's `/docs`, `/redoc`, and `/openapi.json` shortcuts call FastAPI through the runtime `BACKEND_URL` service binding. The Next.js `/api/*` proxy is used when running the two apps locally without Vercel's top-level rewrites. Do **not** set `BACKEND_URL` in Vercel yourself.

Vercel Functions do not provide a durable shared SQLite file. For deployment, create a **libSQL** database in [Turso](https://docs.turso.tech/quickstart) (the default `turso db create supplychainiq` engine, rather than `--tursodb`). Get its URL with `turso db show --url supplychainiq` and a **database token** with `turso db tokens create supplychainiq`; a Turso Platform API key is not the database token. Set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` as Vercel project environment variables, including in each environment you deploy. The backend refuses to use a temporary SQLite file on Vercel when they are absent.

Initialize the hosted database **once**, from a machine with those two environment variables set:

```bash
python -m backend.init_db
# Optional, only on a new/empty database:
python -m backend.init_db --seed
```

The initialization command creates the schema, indexes, triggers, and views. Production cold starts only check that the schema exists. Set the Vercel project's **Framework Preset** to **Services**, then deploy this repository. For local integration testing with Vercel's binding injection, install the Vercel CLI and run `vercel dev -L` from the repository root.

The current app has no authentication. Anyone who can access a public deployment can use its CRUD and stock APIs; add access control before sharing a production URL broadly.

## What the database contains

The 16 ER entities are present: Supplier, Warehouse, Employee, Category, Product, Customer, Purchase Order, Purchase Order Item, Inventory, Stock Movement, Supplier Performance, Sales Order, Sales Order Item, Shipment, Delivery, and Return. `supplier_contact` is a supporting table for the diagram's multivalued contact numbers. Supplier address is split into street, city, state, and country. Order items use composite keys (`po_id, line_no` and `so_id, line_no`) to represent dependent entities.

Foreign keys, uniqueness rules, checks, and indexes are in [`backend/schema.sql`](backend/schema.sql). Four SQL views expose order totals, low stock, and supplier scores. Order totals are calculated from line items instead of stored. Stock movements form an append-only audit trail; a SQLite trigger updates Inventory and checks for negative stock or warehouse capacity overflow.

## Main workflows

1. Create a purchase order, add purchase order items in **Data explorer**, then click **Receive** and choose a warehouse. The transaction records receipt movements and increases stock.
2. Create a sales order, add sales order items, then click **Ship**. The system checks stock, creates a shipment, and deducts inventory in one transaction.
3. In **Distribution**, update the delivery status or record a return. Returns cannot exceed the sold quantity and restore stock to the shipment's warehouse.
4. Use **Adjust stock** or **Transfer stock** for manual inventory operations. Transfers roll back completely if the destination lacks capacity or the source lacks stock.

Inventory, stock movements, shipments, deliveries, and returns are managed through these workflows, so direct edits cannot quietly corrupt stock history. Master data, orders, line items, and supplier evaluations have create, read, update, and delete operations in **Data explorer**. Processed orders and their items are locked. Foreign keys prevent deleting referenced records.

SQLite has no stored procedures, so the multi-step operations run as database transactions in FastAPI. There is no authentication or multi-tenant separation.

## Checks

```bash
pip install -r requirements-dev.txt
python -m pytest -q backend/test_app.py
cd frontend && npm run build
```
