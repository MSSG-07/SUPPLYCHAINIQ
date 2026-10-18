PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS supplier (
  supplier_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  street TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS supplier_contact (
  contact_id INTEGER PRIMARY KEY,
  supplier_id INTEGER NOT NULL REFERENCES supplier(supplier_id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  UNIQUE(supplier_id, phone)
);
CREATE TABLE IF NOT EXISTS warehouse (
  warehouse_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  capacity INTEGER NOT NULL CHECK (capacity > 0)
);
CREATE TABLE IF NOT EXISTS employee (
  employee_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  warehouse_id INTEGER REFERENCES warehouse(warehouse_id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS category (
  category_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS product (
  product_id INTEGER PRIMARY KEY,
  product_name TEXT NOT NULL,
  category_id INTEGER NOT NULL REFERENCES category(category_id),
  unit_price NUMERIC NOT NULL CHECK (unit_price >= 0),
  reorder_level INTEGER NOT NULL DEFAULT 10 CHECK (reorder_level >= 0)
);
CREATE TABLE IF NOT EXISTS customer (
  customer_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS purchase_order (
  po_id INTEGER PRIMARY KEY,
  supplier_id INTEGER NOT NULL REFERENCES supplier(supplier_id),
  employee_id INTEGER NOT NULL REFERENCES employee(employee_id),
  order_date TEXT NOT NULL DEFAULT (date('now')),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RECEIVED'))
);
CREATE TABLE IF NOT EXISTS purchase_order_item (
  po_id INTEGER NOT NULL REFERENCES purchase_order(po_id) ON DELETE CASCADE,
  line_no INTEGER NOT NULL CHECK (line_no > 0),
  product_id INTEGER NOT NULL REFERENCES product(product_id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC NOT NULL CHECK (unit_cost >= 0),
  PRIMARY KEY (po_id, line_no)
);
CREATE TABLE IF NOT EXISTS inventory (
  inventory_id INTEGER PRIMARY KEY,
  warehouse_id INTEGER NOT NULL REFERENCES warehouse(warehouse_id),
  product_id INTEGER NOT NULL REFERENCES product(product_id),
  quantity_on_hand INTEGER NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  UNIQUE(warehouse_id, product_id)
);
CREATE TABLE IF NOT EXISTS stock_movement (
  movement_id INTEGER PRIMARY KEY,
  warehouse_id INTEGER NOT NULL REFERENCES warehouse(warehouse_id),
  product_id INTEGER NOT NULL REFERENCES product(product_id),
  movement_type TEXT NOT NULL CHECK (movement_type IN ('RECEIPT','SALE','TRANSFER_IN','TRANSFER_OUT','ADJUSTMENT_IN','ADJUSTMENT_OUT','RETURN')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  movement_date TEXT NOT NULL DEFAULT (datetime('now')),
  reference_type TEXT,
  reference_id INTEGER,
  note TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS supplier_performance (
  perf_id INTEGER PRIMARY KEY,
  supplier_id INTEGER NOT NULL REFERENCES supplier(supplier_id),
  employee_id INTEGER NOT NULL REFERENCES employee(employee_id),
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  evaluated_at TEXT NOT NULL DEFAULT (date('now')),
  notes TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS sales_order (
  so_id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customer(customer_id),
  employee_id INTEGER NOT NULL REFERENCES employee(employee_id),
  order_date TEXT NOT NULL DEFAULT (date('now')),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','SHIPPED','DELIVERED'))
);
CREATE TABLE IF NOT EXISTS sales_order_item (
  so_id INTEGER NOT NULL REFERENCES sales_order(so_id) ON DELETE CASCADE,
  line_no INTEGER NOT NULL CHECK (line_no > 0),
  product_id INTEGER NOT NULL REFERENCES product(product_id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC NOT NULL CHECK (unit_price >= 0),
  PRIMARY KEY (so_id, line_no)
);
CREATE TABLE IF NOT EXISTS shipment (
  shipment_id INTEGER PRIMARY KEY,
  so_id INTEGER NOT NULL UNIQUE REFERENCES sales_order(so_id),
  warehouse_id INTEGER NOT NULL REFERENCES warehouse(warehouse_id),
  ship_date TEXT NOT NULL DEFAULT (date('now'))
);
CREATE TABLE IF NOT EXISTS delivery (
  delivery_id INTEGER PRIMARY KEY,
  shipment_id INTEGER NOT NULL UNIQUE REFERENCES shipment(shipment_id),
  delivery_date TEXT NOT NULL DEFAULT (date('now')),
  status TEXT NOT NULL CHECK (status IN ('IN_TRANSIT','DELIVERED','DELAYED','FAILED'))
);
CREATE TABLE IF NOT EXISTS "return" (
  return_id INTEGER PRIMARY KEY,
  so_id INTEGER NOT NULL,
  line_no INTEGER NOT NULL,
  warehouse_id INTEGER NOT NULL REFERENCES warehouse(warehouse_id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  reason TEXT NOT NULL,
  return_date TEXT NOT NULL DEFAULT (date('now')),
  FOREIGN KEY (so_id, line_no) REFERENCES sales_order_item(so_id, line_no)
);

CREATE INDEX IF NOT EXISTS idx_po_supplier ON purchase_order(supplier_id);
CREATE INDEX IF NOT EXISTS idx_so_customer ON sales_order(customer_id);
CREATE INDEX IF NOT EXISTS idx_movement_date ON stock_movement(movement_date);
CREATE INDEX IF NOT EXISTS idx_movement_product ON stock_movement(product_id, warehouse_id);
CREATE INDEX IF NOT EXISTS idx_return_item ON "return"(so_id, line_no);

CREATE TRIGGER IF NOT EXISTS movement_check_out BEFORE INSERT ON stock_movement
WHEN NEW.movement_type IN ('SALE','TRANSFER_OUT','ADJUSTMENT_OUT')
BEGIN
  SELECT CASE WHEN COALESCE((SELECT quantity_on_hand FROM inventory WHERE warehouse_id = NEW.warehouse_id AND product_id = NEW.product_id), 0) < NEW.quantity
    THEN RAISE(ABORT, 'Insufficient stock in this warehouse') END;
END;
CREATE TRIGGER IF NOT EXISTS warehouse_capacity_update BEFORE UPDATE OF capacity ON warehouse
BEGIN
  SELECT CASE WHEN NEW.capacity < COALESCE((SELECT SUM(quantity_on_hand) FROM inventory WHERE warehouse_id = NEW.warehouse_id), 0)
    THEN RAISE(ABORT, 'Warehouse capacity cannot be below current stock') END;
END;
CREATE TRIGGER IF NOT EXISTS movement_check_capacity BEFORE INSERT ON stock_movement
WHEN NEW.movement_type IN ('RECEIPT','TRANSFER_IN','ADJUSTMENT_IN','RETURN')
BEGIN
  SELECT CASE WHEN COALESCE((SELECT SUM(quantity_on_hand) FROM inventory WHERE warehouse_id = NEW.warehouse_id), 0) + NEW.quantity >
    (SELECT capacity FROM warehouse WHERE warehouse_id = NEW.warehouse_id)
    THEN RAISE(ABORT, 'Warehouse capacity exceeded') END;
END;
CREATE TRIGGER IF NOT EXISTS movement_apply AFTER INSERT ON stock_movement
BEGIN
  INSERT OR IGNORE INTO inventory(warehouse_id, product_id, quantity_on_hand)
  VALUES (NEW.warehouse_id, NEW.product_id, 0);
  UPDATE inventory SET quantity_on_hand = quantity_on_hand +
    CASE WHEN NEW.movement_type IN ('SALE','TRANSFER_OUT','ADJUSTMENT_OUT') THEN -NEW.quantity ELSE NEW.quantity END
  WHERE warehouse_id = NEW.warehouse_id AND product_id = NEW.product_id;
END;

CREATE VIEW IF NOT EXISTS v_purchase_order_totals AS
SELECT po.po_id, po.supplier_id, po.order_date, po.status,
       COALESCE(ROUND(SUM(item.quantity * item.unit_cost), 2), 0) AS total_cost
FROM purchase_order po LEFT JOIN purchase_order_item item USING(po_id)
GROUP BY po.po_id;

CREATE VIEW IF NOT EXISTS v_sales_order_totals AS
SELECT so.so_id, so.customer_id, so.order_date, so.status,
       COALESCE(ROUND(SUM(item.quantity * item.unit_price), 2), 0) AS total_amount
FROM sales_order so LEFT JOIN sales_order_item item USING(so_id)
GROUP BY so.so_id;

CREATE VIEW IF NOT EXISTS v_inventory_alerts AS
SELECT i.inventory_id, i.warehouse_id, i.product_id, i.quantity_on_hand,
       p.reorder_level, p.product_name, w.name AS warehouse_name
FROM inventory i JOIN product p USING(product_id) JOIN warehouse w USING(warehouse_id)
WHERE i.quantity_on_hand <= p.reorder_level;

CREATE VIEW IF NOT EXISTS v_supplier_scores AS
SELECT s.supplier_id, s.name,
       ROUND(AVG(sp.score), 2) AS average_score,
       COUNT(sp.perf_id) AS evaluation_count
FROM supplier s LEFT JOIN supplier_performance sp USING(supplier_id)
GROUP BY s.supplier_id;
