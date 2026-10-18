"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Row = Record<string, string | number | null>;
type Field = {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
};
type Meta = Record<
  string,
  {
    key: string[];
    fields: Field[];
    references: Record<string, string>;
    workflow: boolean;
  }
>;
type Dashboard = {
  metrics: Record<string, number>;
  alerts: Row[];
  recent_orders: Row[];
  movements: Row[];
  suppliers: Row[];
};
type Insights = { inventory: Row[]; procurement: Row[] };
type Action = "adjust" | "transfer" | "receive" | "ship" | "deliver" | "return";
type Modal =
  | { kind: "entity"; table: string; row?: Row }
  | { kind: "action"; action: Action }
  | null;

const labels: Record<string, string> = {
  supplier: "Suppliers",
  supplier_contact: "Supplier contacts",
  warehouse: "Warehouses",
  employee: "Employees",
  category: "Categories",
  product: "Products",
  customer: "Customers",
  purchase_order: "Purchase orders",
  purchase_order_item: "Purchase order items",
  inventory: "Inventory",
  stock_movement: "Stock movements",
  supplier_performance: "Supplier performance",
  sales_order: "Sales orders",
  sales_order_item: "Sales order items",
  shipment: "Shipments",
  delivery: "Deliveries",
  return: "Returns",
};
const groups: Record<string, string[]> = {
  "MASTER DATA": [
    "supplier",
    "supplier_contact",
    "warehouse",
    "employee",
    "category",
    "product",
    "customer",
  ],
  PROCUREMENT: [
    "purchase_order",
    "purchase_order_item",
    "supplier_performance",
  ],
  INVENTORY: ["inventory", "stock_movement"],
  "SALES & DELIVERY": [
    "sales_order",
    "sales_order_item",
    "shipment",
    "delivery",
    "return",
  ],
};
const nav = [
  ["overview", "Overview", "▦"],
  ["inventory", "Inventory", "◫"],
  ["procurement", "Procurement", "▤"],
  ["sales", "Sales orders", "◈"],
  ["distribution", "Distribution", "↗"],
  ["explorer", "Data explorer", "▥"],
  ["insights", "Insights", "◩"],
];
const money = (value: unknown) =>
  `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const pretty = (text: string) =>
  text.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
const date = (value: unknown) => String(value || "").slice(0, 10);
const idText = (prefix: string, value: unknown) =>
  `${prefix}-${String(value).padStart(4, "0")}`;

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      headers: { "Content-Type": "application/json", ...options?.headers },
      cache: "no-store",
    });
  } catch {
    throw new Error("Cannot reach the SupplyChainIQ API through the frontend.");
  }
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      typeof result.detail === "string" ? result.detail : "Request failed",
    );
  return result as T;
}

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    refresh: (
      <>
        <path d="M20 11a8 8 0 0 0-14-5L4 8M4 4v4h4M4 13a8 8 0 0 0 14 5l2-2M20 20v-4h-4" />
      </>
    ),
    box: (
      <>
        <path d="m3 7 9-4 9 4-9 4-9-4ZM3 7v10l9 4 9-4V7M12 11v10" />
      </>
    ),
    bag: (
      <>
        <path d="M4 8h16l-1 13H5L4 8ZM9 9V6a3 3 0 0 1 6 0v3" />
      </>
    ),
    cart: (
      <>
        <circle cx="9" cy="20" r="1" />
        <circle cx="19" cy="20" r="1" />
        <path d="M2 3h2l3 13h13l2-9H5" />
      </>
    ),
    truck: (
      <>
        <path d="M2 6h12v11H2zM14 10h4l4 4v3h-8z" />
        <circle cx="6" cy="18" r="2" />
        <circle cx="18" cy="18" r="2" />
      </>
    ),
    alert: (
      <>
        <path d="m12 2 10 18H2L12 2ZM12 8v5M12 17h.01" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m16 16 5 5" />
      </>
    ),
    close: <path d="M5 5 19 19M19 5 5 19" />,
    edit: (
      <>
        <path d="M4 20h4L20 8l-4-4L4 16v4ZM14 6l4 4" />
      </>
    ),
    trash: (
      <>
        <path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6" />
      </>
    ),
    check: <path d="m4 12 5 5L20 6" />,
    database: (
      <>
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M3 5v14c0 2 4 3 9 3s9-1 9-3V5M3 12c0 2 4 3 9 3s9-1 9-3" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.box}
    </svg>
  );
}

function Status({ value }: { value: unknown }) {
  const text = String(value || "");
  const tone = ["RECEIVED", "DELIVERED", "HEALTHY"].includes(text)
    ? "green"
    : ["OPEN", "SHIPPED", "IN_TRANSIT"].includes(text)
      ? "blue"
      : "orange";
  return (
    <span className={`status ${tone}`}>
      <i />
      {pretty(text)}
    </span>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <Icon name="database" size={29} />
      <strong>Nothing here yet</strong>
      <span>{text}</span>
    </div>
  );
}
function Heading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}
function Metric({
  label,
  value,
  note,
  icon,
  tone,
}: {
  label: string;
  value: string | number;
  note: string;
  icon: string;
  tone: string;
}) {
  return (
    <div className="metric">
      <div className="metric-top">
        <span>{label}</span>
        <div className={`metric-icon ${tone}`}>
          <Icon name={icon} size={20} />
        </div>
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

export default function Home() {
  const [view, setView] = useState("overview");
  const [entity, setEntity] = useState("product");
  const [meta, setMeta] = useState<Meta>({});
  const [rows, setRows] = useState<Record<string, Row[]>>({});
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [m, d, i, ...lists] = await Promise.all([
        api<Meta>("/api/meta"),
        api<Dashboard>("/api/dashboard"),
        api<Insights>("/api/insights"),
        ...Object.keys(labels).map((name) => api<Row[]>(`/api/data/${name}`)),
      ]);
      const all: Record<string, Row[]> = {};
      Object.keys(labels).forEach((name, index) => {
        all[name] = lists[index];
      });
      setMeta(m);
      setDashboard(d);
      setInsights(i);
      setRows(all);
      setError("");
    } catch (exc) {
      setError((exc as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(reload);
  }, [reload]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 3500);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const openEntity = (table: string, row?: Row) => {
    setError("");
    setForm(
      row
        ? Object.fromEntries(
            Object.entries(row).map(([key, value]) => [
              key,
              String(value ?? ""),
            ]),
          )
        : {},
    );
    setModal({ kind: "entity", table, row });
  };
  const openAction = (action: Action, initial: Record<string, string> = {}) => {
    setError("");
    setForm(initial);
    setModal({ kind: "action", action });
  };
  const explorer = (table: string) => {
    setEntity(table);
    setSearch("");
    setView("explorer");
  };
  const keyOf = (table: string, row: Row) =>
    meta[table].key.map((key) => row[key]).join(":");
  const labelOf = (table: string, id: unknown): string => {
    const key = meta[table]?.key[0];
    const found = rows[table]?.find((row) => String(row[key]) === String(id));
    if (!found) return `#${id}`;
    return String(
      found.product_name ||
        found.name ||
        (found.so_id ? `SO #${found.so_id}` : "") ||
        (found.po_id ? `PO #${found.po_id}` : "") ||
        (found.shipment_id ? `Shipment #${found.shipment_id}` : "") ||
        `#${id}`,
    );
  };
  const display = (
    table: string,
    field: string,
    value: unknown,
  ): React.ReactNode => {
    if (value === null || value === undefined || value === "") return "—";
    if (field === "status") return <Status value={value} />;
    if (
      ["unit_price", "unit_cost", "total_cost", "total_amount"].includes(field)
    )
      return money(value);
    if (field === "score")
      return <span className="score">★ {String(value)}/5</span>;
    const reference = meta[table]?.references[field];
    if (reference && meta[reference]?.key.length === 1)
      return labelOf(reference, value);
    if (field.includes("date") || field === "evaluated_at") return date(value);
    return String(value);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!modal) return;
    setSaving(true);
    setError("");
    try {
      let path = "";
      let method = "POST";
      const payload: Record<string, string | number | null> = {};
      if (modal.kind === "entity") {
        const table = modal.table;
        for (const field of meta[table].fields) {
          if (field.pk && (modal.row || meta[table].key.length === 1)) continue;
          if (
            field.name === "status" &&
            ["purchase_order", "sales_order"].includes(table)
          )
            continue;
          const value = form[field.name];
          if (value !== undefined && value !== "")
            payload[field.name] = /INT|NUMERIC/.test(field.type)
              ? Number(value)
              : value;
          else if (modal.row && value === "" && !field.notnull)
            payload[field.name] = null;
          else if (
            modal.row &&
            value === "" &&
            field.type === "TEXT" &&
            field.dflt_value === "''"
          )
            payload[field.name] = "";
        }
        path = modal.row
          ? `/api/data/${table}/${keyOf(table, modal.row)}`
          : `/api/data/${table}`;
        if (modal.row) method = "PATCH";
      } else {
        const action = modal.action;
        path =
          action === "adjust"
            ? "/api/stock/adjust"
            : action === "transfer"
              ? "/api/stock/transfer"
              : action === "receive"
                ? `/api/purchase-orders/${form.po_id}/receive`
                : action === "ship"
                  ? `/api/sales-orders/${form.so_id}/ship`
                  : action === "deliver"
                    ? `/api/shipments/${form.shipment_id}/deliver`
                    : "/api/returns";
        for (const [key, value] of Object.entries(form)) {
          if (
            !value ||
            ["po_id", "shipment_id"].includes(key) ||
            (action === "ship" && key === "so_id")
          )
            continue;
          payload[key] = [
            "quantity",
            "warehouse_id",
            "product_id",
            "source_warehouse_id",
            "target_warehouse_id",
            "so_id",
            "line_no",
          ].includes(key)
            ? Number(value)
            : value;
        }
      }
      await api(path, { method, body: JSON.stringify(payload) });
      setModal(null);
      setToast(modal.kind === "entity" ? "Record saved" : "Workflow completed");
      await reload();
    } catch (exc) {
      setError((exc as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const remove = async (table: string, row: Row) => {
    if (!window.confirm(`Delete this ${labels[table].toLowerCase()} record?`))
      return;
    try {
      await api(`/api/data/${table}/${keyOf(table, row)}`, {
        method: "DELETE",
      });
      setToast("Record deleted");
      await reload();
    } catch (exc) {
      setError((exc as Error).message);
    }
  };
  const filtered = useMemo(
    () =>
      (rows[entity] || []).filter((row) =>
        Object.values(row).some((value) =>
          String(value ?? "")
            .toLowerCase()
            .includes(search.toLowerCase()),
        ),
      ),
    [rows, entity, search],
  );
  const currentTitle = nav.find((item) => item[0] === view)?.[1] || "Overview";

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">▧</div>
          <div>
            <strong>
              SupplyChain<span>IQ</span>
            </strong>
            <small>OPERATIONS COMMAND</small>
          </div>
        </div>
        <div className="sidebar-label">WORKSPACE</div>
        <nav>
          {nav.map(([id, label, icon]) => (
            <button
              key={id}
              className={`nav-item ${view === id ? "active" : ""}`}
              onClick={() => setView(id)}
            >
              <span className="nav-icon">{icon}</span>
              <span>{label}</span>
              {id === "inventory" && dashboard?.metrics.low_stock ? (
                <em>{dashboard.metrics.low_stock}</em>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="system">
            <Icon name="database" />
            <div>
              <strong>System online</strong>
              <span>SQLite · FastAPI</span>
            </div>
            <i />
          </div>
          <div className="profile">
            <div className="avatar">SC</div>
            <div>
              <strong>Project workspace</strong>
              <span>DBMS dashboard</span>
            </div>
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="breadcrumbs">
            Workspace <span>›</span> <strong>{currentTitle}</strong>
          </div>
          <div className="top-actions">
            <span>Live operations</span>
            <button title="Refresh" onClick={() => void reload()}>
              <Icon name="refresh" />
            </button>
            <button
              title="Low stock alerts"
              onClick={() => setView("inventory")}
            >
              <Icon name="alert" />
            </button>
            <div className="mini-avatar">SC</div>
          </div>
        </header>
        <div className="content">
          {error && (
            <div className="error">
              <Icon name="alert" />
              <span>{error}</span>
              <button onClick={() => setError("")}>
                <Icon name="close" size={16} />
              </button>
            </div>
          )}
          {toast && (
            <div className="toast">
              <Icon name="check" size={16} />
              {toast}
            </div>
          )}
          {loading ? (
            <div className="loading">Loading SupplyChainIQ…</div>
          ) : (
            <>
              {view === "overview" && dashboard && (
                <>
                  <Heading
                    eyebrow="YOUR OPERATIONS AT A GLANCE"
                    title="Supply chain overview"
                    description="Track stock, orders, and fulfillment across your network."
                  >
                    <button
                      className="primary"
                      onClick={() => openEntity("sales_order")}
                    >
                      <Icon name="plus" /> New sales order
                    </button>
                  </Heading>
                  <div className="metrics">
                    <Metric
                      label="Inventory value"
                      value={money(dashboard.metrics.inventory_value)}
                      note="Across all warehouses"
                      icon="box"
                      tone="teal"
                    />
                    <Metric
                      label="Units in stock"
                      value={dashboard.metrics.stock_units.toLocaleString(
                        "en-IN",
                      )}
                      note={`${dashboard.metrics.products} active products`}
                      icon="database"
                      tone="blue"
                    />
                    <Metric
                      label="Open purchase orders"
                      value={dashboard.metrics.open_purchase_orders}
                      note="Awaiting receipt"
                      icon="bag"
                      tone="purple"
                    />
                    <Metric
                      label="Low stock alerts"
                      value={dashboard.metrics.low_stock}
                      note="At or below reorder point"
                      icon="alert"
                      tone="coral"
                    />
                  </div>
                  <div className="two-col">
                    <section className="panel">
                      <PanelHead
                        title="Recent sales orders"
                        subtitle="Latest customer demand and fulfillment"
                        action={
                          <button
                            className="link"
                            onClick={() => setView("sales")}
                          >
                            View all <Icon name="arrow" size={16} />
                          </button>
                        }
                      />
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>ORDER</th>
                              <th>CUSTOMER</th>
                              <th>DATE</th>
                              <th>AMOUNT</th>
                              <th>STATUS</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dashboard.recent_orders.map((row) => (
                              <tr key={row.so_id}>
                                <td className="strong">
                                  {idText("SO", row.so_id)}
                                </td>
                                <td>{row.customer}</td>
                                <td>{date(row.order_date)}</td>
                                <td className="strong">{money(row.total)}</td>
                                <td>
                                  <Status value={row.status} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {!dashboard.recent_orders.length && (
                          <Empty text="Create a sales order to see it here." />
                        )}
                      </div>
                    </section>
                    <section className="panel">
                      <PanelHead
                        title="Needs attention"
                        subtitle="Stock running below target"
                        action={
                          <span className="count-pill">
                            {dashboard.alerts.length} alerts
                          </span>
                        }
                      />
                      <div className="alert-list">
                        {dashboard.alerts.slice(0, 4).map((row, index) => (
                          <div className="alert-row" key={index}>
                            <div className="alert-symbol">
                              <Icon name="alert" size={17} />
                            </div>
                            <div>
                              <strong>{row.product_name}</strong>
                              <span>{row.warehouse}</span>
                            </div>
                            <div className="right">
                              <strong>{row.quantity_on_hand}</strong>
                              <span>min {row.reorder_level}</span>
                            </div>
                          </div>
                        ))}
                        {!dashboard.alerts.length && (
                          <Empty text="All stock levels look healthy." />
                        )}
                      </div>
                      <button
                        className="panel-link"
                        onClick={() => setView("inventory")}
                      >
                        Review inventory <Icon name="arrow" size={16} />
                      </button>
                    </section>
                  </div>
                  <div className="two-col lower">
                    <section className="panel">
                      <PanelHead
                        title="Recent stock activity"
                        subtitle="A trail of inventory changes"
                        action={
                          <button
                            className="link"
                            onClick={() => explorer("stock_movement")}
                          >
                            View ledger <Icon name="arrow" size={16} />
                          </button>
                        }
                      />
                      <div className="activity-list">
                        {dashboard.movements.slice(0, 5).map((row) => (
                          <div className="activity-row" key={row.movement_id}>
                            <div
                              className={`activity-icon ${["SALE", "TRANSFER_OUT", "ADJUSTMENT_OUT"].includes(String(row.movement_type)) ? "out" : "in"}`}
                            >
                              <Icon
                                name={
                                  row.movement_type === "SALE" ? "cart" : "box"
                                }
                                size={16}
                              />
                            </div>
                            <div>
                              <strong>
                                {pretty(String(row.movement_type))}
                              </strong>
                              <span>
                                {row.product_name} · {row.warehouse}
                              </span>
                            </div>
                            <div className="right">
                              <strong>
                                {[
                                  "SALE",
                                  "TRANSFER_OUT",
                                  "ADJUSTMENT_OUT",
                                ].includes(String(row.movement_type))
                                  ? "−"
                                  : "+"}
                                {row.quantity}
                              </strong>
                              <span>{date(row.movement_date)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                    <section className="panel">
                      <PanelHead
                        title="Quick actions"
                        subtitle="Keep your supply chain moving"
                      />
                      <div className="quick-grid">
                        {[
                          [
                            "adjust",
                            "Adjust stock",
                            "Record an inventory change",
                            "plus",
                          ],
                          [
                            "transfer",
                            "Transfer stock",
                            "Move between warehouses",
                            "truck",
                          ],
                          [
                            "purchase",
                            "New purchase order",
                            "Start a supplier order",
                            "bag",
                          ],
                          [
                            "return",
                            "Record return",
                            "Restore returned items",
                            "refresh",
                          ],
                        ].map(([action, title, note, icon]) => (
                          <button
                            key={action}
                            onClick={() =>
                              action === "purchase"
                                ? openEntity("purchase_order")
                                : openAction(action as Action)
                            }
                          >
                            <div className="quick-icon">
                              <Icon name={icon} />
                            </div>
                            <strong>{title}</strong>
                            <span>{note}</span>
                            <Icon name="arrow" size={16} />
                          </button>
                        ))}
                      </div>
                    </section>
                  </div>
                </>
              )}
              {view === "inventory" && (
                <>
                  <Heading
                    eyebrow="STOCK CONTROL"
                    title="Inventory"
                    description="Availability, reorder alerts, and warehouse movements."
                  >
                    <button
                      className="primary"
                      onClick={() => openAction("adjust")}
                    >
                      <Icon name="plus" /> Adjust stock
                    </button>
                  </Heading>
                  <div className="mini-stats">
                    <div>
                      <span>Total units</span>
                      <strong>{dashboard?.metrics.stock_units}</strong>
                    </div>
                    <div>
                      <span>Stock value</span>
                      <strong>
                        {money(dashboard?.metrics.inventory_value)}
                      </strong>
                    </div>
                    <div>
                      <span>Low stock positions</span>
                      <strong>{dashboard?.metrics.low_stock}</strong>
                    </div>
                  </div>
                  <div className="toolbar">
                    <button
                      className="secondary"
                      onClick={() => openAction("transfer")}
                    >
                      <Icon name="truck" /> Transfer between warehouses
                    </button>
                    <button
                      className="secondary"
                      onClick={() => explorer("stock_movement")}
                    >
                      <Icon name="database" /> Movement ledger
                    </button>
                  </div>
                  <section className="panel">
                    <PanelHead
                      title="Warehouse stock"
                      subtitle="Every product and warehouse combination"
                      action={
                        <span className="count-pill">
                          {rows.inventory?.length || 0} positions
                        </span>
                      }
                    />
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>PRODUCT</th>
                            <th>WAREHOUSE</th>
                            <th>ON HAND</th>
                            <th>REORDER LEVEL</th>
                            <th>STATUS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(rows.inventory || []).map((row) => {
                            const product = rows.product?.find(
                              (p) => p.product_id === row.product_id,
                            );
                            const low =
                              Number(row.quantity_on_hand) <=
                              Number(product?.reorder_level || 0);
                            return (
                              <tr key={row.inventory_id}>
                                <td className="strong">
                                  {labelOf("product", row.product_id)}
                                </td>
                                <td>
                                  {labelOf("warehouse", row.warehouse_id)}
                                </td>
                                <td>{row.quantity_on_hand}</td>
                                <td>{product?.reorder_level}</td>
                                <td>
                                  <Status
                                    value={low ? "LOW STOCK" : "HEALTHY"}
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {!rows.inventory?.length && (
                        <Empty text="Receive an order or adjust stock to get started." />
                      )}
                    </div>
                  </section>
                </>
              )}
              {view === "procurement" && (
                <>
                  <Heading
                    eyebrow="SUPPLIER TO STOCK"
                    title="Procurement"
                    description="Create purchase orders, add line items, then receive stock."
                  >
                    <button
                      className="primary"
                      onClick={() => openEntity("purchase_order")}
                    >
                      <Icon name="plus" /> New purchase order
                    </button>
                  </Heading>
                  <div className="hint">
                    <Icon name="bag" />
                    <span>
                      After creating an order, add products in{" "}
                      <button onClick={() => explorer("purchase_order_item")}>
                        Purchase order items
                      </button>
                      , then receive it into a warehouse.
                    </span>
                  </div>
                  <Orders
                    kind="purchase"
                    rows={rows.purchase_order || []}
                    labelOf={labelOf}
                    openItems={() => explorer("purchase_order_item")}
                    action={(id) =>
                      openAction("receive", { po_id: String(id) })
                    }
                    edit={(row) => openEntity("purchase_order", row)}
                    remove={(row) => void remove("purchase_order", row)}
                  />
                </>
              )}
              {view === "sales" && (
                <>
                  <Heading
                    eyebrow="CUSTOMER DEMAND"
                    title="Sales orders"
                    description="Manage orders from placement through dispatch."
                  >
                    <button
                      className="primary"
                      onClick={() => openEntity("sales_order")}
                    >
                      <Icon name="plus" /> New sales order
                    </button>
                  </Heading>
                  <div className="hint">
                    <Icon name="cart" />
                    <span>
                      After creating an order, add products in{" "}
                      <button onClick={() => explorer("sales_order_item")}>
                        Sales order items
                      </button>
                      , then ship it from a warehouse.
                    </span>
                  </div>
                  <Orders
                    kind="sales"
                    rows={rows.sales_order || []}
                    labelOf={labelOf}
                    openItems={() => explorer("sales_order_item")}
                    action={(id) => openAction("ship", { so_id: String(id) })}
                    edit={(row) => openEntity("sales_order", row)}
                    remove={(row) => void remove("sales_order", row)}
                  />
                </>
              )}
              {view === "distribution" && (
                <>
                  <Heading
                    eyebrow="LAST MILE"
                    title="Distribution"
                    description="Track shipments, deliveries, and customer returns."
                  >
                    <button
                      className="primary"
                      onClick={() => openAction("return")}
                    >
                      <Icon name="plus" /> Record return
                    </button>
                  </Heading>
                  <div className="two-col">
                    <section className="panel">
                      <PanelHead
                        title="Shipments"
                        subtitle="Dispatched customer orders"
                      />
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>SHIPMENT</th>
                              <th>ORDER</th>
                              <th>WAREHOUSE</th>
                              <th>SHIP DATE</th>
                              <th>ACTION</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(rows.shipment || []).map((row) => (
                              <tr key={row.shipment_id}>
                                <td className="strong">
                                  {idText("SHP", row.shipment_id)}
                                </td>
                                <td>{idText("SO", row.so_id)}</td>
                                <td>
                                  {labelOf("warehouse", row.warehouse_id)}
                                </td>
                                <td>{date(row.ship_date)}</td>
                                <td>
                                  <button
                                    className="table-action"
                                    onClick={() =>
                                      openAction("deliver", {
                                        shipment_id: String(row.shipment_id),
                                        status: "DELIVERED",
                                      })
                                    }
                                  >
                                    Update delivery
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {!rows.shipment?.length && (
                          <Empty text="Shipped orders appear here." />
                        )}
                      </div>
                    </section>
                    <section className="panel">
                      <PanelHead
                        title="Returns"
                        subtitle="Items restored to stock"
                      />
                      <div className="activity-list">
                        {(rows.return || []).map((row) => (
                          <div className="activity-row" key={row.return_id}>
                            <div className="activity-icon in">
                              <Icon name="refresh" size={16} />
                            </div>
                            <div>
                              <strong>
                                {idText("SO", row.so_id)} · line {row.line_no}
                              </strong>
                              <span>{row.reason}</span>
                            </div>
                            <div className="right">
                              <strong>+{row.quantity}</strong>
                              <span>{date(row.return_date)}</span>
                            </div>
                          </div>
                        ))}
                        {!rows.return?.length && (
                          <Empty text="No returns recorded yet." />
                        )}
                      </div>
                    </section>
                  </div>
                </>
              )}
              {view === "explorer" && (
                <>
                  <Heading
                    eyebrow="RELATIONAL DATA"
                    title="Data explorer"
                    description="Browse and manage the tables behind your ER diagram."
                  >
                    {!meta[entity]?.workflow && (
                      <button
                        className="primary"
                        onClick={() => openEntity(entity)}
                      >
                        <Icon name="plus" /> Add record
                      </button>
                    )}
                  </Heading>
                  <div className="explorer">
                    <aside className="entity-nav">
                      {Object.entries(groups).map(([group, names]) => (
                        <div key={group}>
                          <small>{group}</small>
                          {names.map((name) => (
                            <button
                              key={name}
                              className={entity === name ? "selected" : ""}
                              onClick={() => {
                                setEntity(name);
                                setSearch("");
                              }}
                            >
                              {labels[name]}
                              <span>{rows[name]?.length || 0}</span>
                            </button>
                          ))}
                        </div>
                      ))}
                    </aside>
                    <section className="panel explorer-panel">
                      <div className="panel-head">
                        <div>
                          <h2>{labels[entity]}</h2>
                          <p>
                            {rows[entity]?.length || 0} records ·{" "}
                            {meta[entity]?.workflow
                              ? "Managed by workflows"
                              : "Create, edit, and delete"}
                          </p>
                        </div>
                        <label className="search">
                          <Icon name="search" size={17} />
                          <input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Search records…"
                          />
                        </label>
                      </div>
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              {meta[entity]?.fields.slice(0, 6).map((field) => (
                                <th key={field.name}>
                                  {pretty(field.name).toUpperCase()}
                                </th>
                              ))}
                              {!meta[entity]?.workflow && <th>ACTIONS</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {filtered.map((row, index) => (
                              <tr key={index}>
                                {meta[entity]?.fields
                                  .slice(0, 6)
                                  .map((field) => (
                                    <td
                                      key={field.name}
                                      className={field.pk ? "strong" : ""}
                                    >
                                      {display(
                                        entity,
                                        field.name,
                                        row[field.name],
                                      )}
                                    </td>
                                  ))}
                                {!meta[entity]?.workflow && (
                                  <td>
                                    <div className="row-actions">
                                      <button
                                        title="Edit"
                                        onClick={() => openEntity(entity, row)}
                                      >
                                        <Icon name="edit" size={15} />
                                      </button>
                                      <button
                                        title="Delete"
                                        onClick={() => void remove(entity, row)}
                                      >
                                        <Icon name="trash" size={15} />
                                      </button>
                                    </div>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {!filtered.length && (
                          <Empty
                            text={
                              search
                                ? "No records match your search."
                                : "Add a record to get started."
                            }
                          />
                        )}
                      </div>
                    </section>
                  </div>
                </>
              )}
              {view === "insights" && (
                <>
                  <Heading
                    eyebrow="DECISION SUPPORT"
                    title="Insights"
                    description="Stock value, supplier spend, and performance in one view."
                  />
                  <div className="mini-stats">
                    <div>
                      <span>Sales order value</span>
                      <strong>{money(dashboard?.metrics.sales_value)}</strong>
                    </div>
                    <div>
                      <span>Stock value</span>
                      <strong>
                        {money(dashboard?.metrics.inventory_value)}
                      </strong>
                    </div>
                    <div>
                      <span>Shipments</span>
                      <strong>{dashboard?.metrics.shipments}</strong>
                    </div>
                  </div>
                  <div className="two-col">
                    <section className="panel">
                      <PanelHead
                        title="Inventory value by position"
                        subtitle="Product value across warehouses"
                      />
                      <div className="bar-list">
                        {insights?.inventory.slice(0, 7).map((row, index) => (
                          <div className="bar-row" key={index}>
                            <div>
                              <strong>{row.product_name}</strong>
                              <span>
                                {row.warehouse} · {row.quantity_on_hand} units
                              </span>
                            </div>
                            <div className="bar-track">
                              <i
                                style={{
                                  width: `${Math.max(4, (Number(row.stock_value) / Math.max(1, Number(insights.inventory[0]?.stock_value))) * 100)}%`,
                                }}
                              />
                            </div>
                            <b>{money(row.stock_value)}</b>
                          </div>
                        ))}
                      </div>
                    </section>
                    <section className="panel">
                      <PanelHead
                        title="Supplier scorecard"
                        subtitle="Spend and evaluation scores"
                      />
                      <div className="supplier-list">
                        {insights?.procurement.map((row, index) => (
                          <div className="supplier-row" key={index}>
                            <div className="supplier-avatar">
                              {String(row.supplier).slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <strong>{row.supplier}</strong>
                              <span>
                                {row.orders} orders · {money(row.spend)} spend
                              </span>
                            </div>
                            <b>{row.score ? `★ ${row.score}` : "—"}</b>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </main>
      {modal && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setModal(null);
          }}
        >
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-head">
              <div>
                <span className="eyebrow">
                  {modal.kind === "entity"
                    ? "DATA MANAGEMENT"
                    : "OPERATIONS WORKFLOW"}
                </span>
                <h2>
                  {modal.kind === "entity"
                    ? `${modal.row ? "Edit" : "Add"} ${labels[modal.table]}`
                    : pretty(
                        modal.action === "receive"
                          ? "Receive purchase order"
                          : modal.action === "ship"
                            ? "Ship sales order"
                            : modal.action === "deliver"
                              ? "Update delivery"
                              : modal.action === "return"
                                ? "Record return"
                                : `${modal.action} stock`,
                      )}
                </h2>
              </div>
              <button onClick={() => setModal(null)}>
                <Icon name="close" size={20} />
              </button>
            </div>
            <form onSubmit={submit}>
              <div className="modal-body">
                {error && <div className="modal-error">{error}</div>}
                {modal.kind === "entity" ? (
                  meta[modal.table]?.fields
                    .filter(
                      (field) =>
                        (!field.pk ||
                          (meta[modal.table].key.length > 1 && !modal.row)) &&
                        !(
                          field.name === "status" &&
                          ["purchase_order", "sales_order"].includes(
                            modal.table,
                          )
                        ),
                    )
                    .map((field) => (
                      <FieldInput
                        key={field.name}
                        name={field.name}
                        field={field}
                        value={form[field.name] || ""}
                        options={
                          meta[modal.table].references[field.name] &&
                          meta[meta[modal.table].references[field.name]]?.key
                            .length === 1
                            ? rows[
                                meta[modal.table].references[field.name]
                              ]?.map((row) => ({
                                value: String(
                                  row[
                                    meta[
                                      meta[modal.table].references[field.name]
                                    ].key[0]
                                  ],
                                ),
                                label: labelOf(
                                  meta[modal.table].references[field.name],
                                  row[
                                    meta[
                                      meta[modal.table].references[field.name]
                                    ].key[0]
                                  ],
                                ),
                              }))
                            : undefined
                        }
                        onChange={(value) =>
                          setForm((previous) => ({
                            ...previous,
                            [field.name]: value,
                          }))
                        }
                      />
                    ))
                ) : (
                  <ActionFields
                    action={modal.action}
                    form={form}
                    setForm={setForm}
                    rows={rows}
                    labelOf={labelOf}
                  />
                )}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setModal(null)}
                >
                  Cancel
                </button>
                <button className="primary" disabled={saving}>
                  {saving
                    ? "Saving…"
                    : modal.kind === "entity"
                      ? "Save record"
                      : "Confirm action"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function PanelHead({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="panel-head">
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      {action}
    </div>
  );
}
function Orders({
  kind,
  rows,
  labelOf,
  openItems,
  action,
  edit,
  remove,
}: {
  kind: "purchase" | "sales";
  rows: Row[];
  labelOf: (table: string, id: unknown) => string;
  openItems: () => void;
  action: (id: unknown) => void;
  edit: (row: Row) => void;
  remove: (row: Row) => void;
}) {
  const purchase = kind === "purchase";
  const id = purchase ? "po_id" : "so_id";
  return (
    <section className="panel">
      <PanelHead
        title={`${purchase ? "Purchase" : "Sales"} order register`}
        subtitle={`${rows.length} orders in the system`}
        action={
          <button className="link" onClick={openItems}>
            Manage line items <Icon name="arrow" size={16} />
          </button>
        }
      />
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>ORDER</th>
              <th>{purchase ? "SUPPLIER" : "CUSTOMER"}</th>
              <th>EMPLOYEE</th>
              <th>DATE</th>
              <th>TOTAL</th>
              <th>STATUS</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row[id]}>
                <td className="strong">
                  {idText(purchase ? "PO" : "SO", row[id])}
                </td>
                <td>
                  {labelOf(
                    purchase ? "supplier" : "customer",
                    row[purchase ? "supplier_id" : "customer_id"],
                  )}
                </td>
                <td>{labelOf("employee", row.employee_id)}</td>
                <td>{date(row.order_date)}</td>
                <td className="strong">
                  {money(row[purchase ? "total_cost" : "total_amount"])}
                </td>
                <td>
                  <Status value={row.status} />
                </td>
                <td>
                  <div className="row-actions">
                    {row.status === "OPEN" && (
                      <>
                        <button
                          className="table-action"
                          onClick={() => action(row[id])}
                        >
                          {purchase ? "Receive" : "Ship"}
                        </button>
                        <button title="Edit" onClick={() => edit(row)}>
                          <Icon name="edit" size={15} />
                        </button>
                        <button title="Delete" onClick={() => remove(row)}>
                          <Icon name="trash" size={15} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <Empty text="Create an order to get started." />}
      </div>
    </section>
  );
}

function FieldInput({
  name,
  field,
  value,
  options,
  onChange,
}: {
  name: string;
  field?: Field;
  value: string;
  options?: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const required = (!!field?.notnull && !field.dflt_value) || !!field?.pk;
  const numeric =
    /INT|NUMERIC/.test(field?.type || "") ||
    ["quantity", "line_no"].includes(name);
  const type =
    name.includes("date") || name === "evaluated_at"
      ? "date"
      : name === "email"
        ? "email"
        : numeric
          ? "number"
          : "text";
  return (
    <label className="form-field">
      <span>
        {pretty(name)} {required && <i>*</i>}
      </span>
      {options ? (
        <select
          value={value}
          required={required}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Select {pretty(name).toLowerCase()}</option>
          {options.map((option) => (
            <option value={option.value} key={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          value={value}
          required={required}
          min={
            numeric &&
            !["unit_price", "unit_cost", "reorder_level"].includes(name)
              ? 1
              : numeric
                ? 0
                : undefined
          }
          step={field?.type.includes("NUMERIC") ? "0.01" : undefined}
          onChange={(event) => onChange(event.target.value)}
          placeholder={pretty(name)}
        />
      )}
    </label>
  );
}
function ActionFields({
  action,
  form,
  setForm,
  rows,
  labelOf,
}: {
  action: Action;
  form: Record<string, string>;
  setForm: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  rows: Record<string, Row[]>;
  labelOf: (table: string, id: unknown) => string;
}) {
  const fields: Record<
    Action,
    { name: string; source?: string; choices?: string[]; optional?: boolean }[]
  > = {
    adjust: [
      { name: "warehouse_id", source: "warehouse" },
      { name: "product_id", source: "product" },
      { name: "direction", choices: ["IN", "OUT"] },
      { name: "quantity" },
      { name: "note", optional: true },
    ],
    transfer: [
      { name: "source_warehouse_id", source: "warehouse" },
      { name: "target_warehouse_id", source: "warehouse" },
      { name: "product_id", source: "product" },
      { name: "quantity" },
    ],
    receive: [
      { name: "po_id", source: "purchase_order" },
      { name: "warehouse_id", source: "warehouse" },
    ],
    ship: [
      { name: "so_id", source: "sales_order" },
      { name: "warehouse_id", source: "warehouse" },
    ],
    deliver: [
      { name: "shipment_id", source: "shipment" },
      {
        name: "status",
        choices: ["IN_TRANSIT", "DELIVERED", "DELAYED", "FAILED"],
      },
    ],
    return: [
      { name: "so_id", source: "sales_order" },
      { name: "line_no" },
      { name: "quantity" },
      { name: "reason" },
    ],
  };
  return (
    <>
      {fields[action].map((item) => {
        let options = item.source ? rows[item.source] || [] : [];
        if (
          ["receive", "ship"].includes(action) &&
          ["po_id", "so_id"].includes(item.name)
        )
          options = options.filter((row) => row.status === "OPEN");
        if (action === "return" && item.name === "so_id")
          options = options.filter((row) =>
            ["SHIPPED", "DELIVERED"].includes(String(row.status)),
          );
        const key =
          item.source === "purchase_order"
            ? "po_id"
            : item.source === "sales_order"
              ? "so_id"
              : item.source === "shipment"
                ? "shipment_id"
                : item.source === "product"
                  ? "product_id"
                  : "warehouse_id";
        return (
          <label className="form-field" key={item.name}>
            <span>
              {pretty(item.name)} {!item.optional && <i>*</i>}
            </span>
            {item.source || item.choices ? (
              <select
                required={!item.optional}
                value={form[item.name] || ""}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    [item.name]: event.target.value,
                  }))
                }
              >
                <option value="">
                  Select {pretty(item.name).toLowerCase()}
                </option>
                {item.choices?.map((choice) => (
                  <option value={choice} key={choice}>
                    {pretty(choice)}
                  </option>
                ))}
                {options.map((row) => (
                  <option value={String(row[key])} key={row[key]}>
                    {labelOf(item.source!, row[key])}
                  </option>
                ))}
              </select>
            ) : (
              <input
                required={!item.optional}
                type={
                  ["quantity", "line_no"].includes(item.name)
                    ? "number"
                    : "text"
                }
                min="1"
                value={form[item.name] || ""}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    [item.name]: event.target.value,
                  }))
                }
                placeholder={pretty(item.name)}
              />
            )}
          </label>
        );
      })}
      {action === "return" && form.so_id && (
        <p className="form-help">
          Available lines:{" "}
          {(rows.sales_order_item || [])
            .filter((row) => String(row.so_id) === form.so_id)
            .map(
              (row) =>
                `#${row.line_no} ${labelOf("product", row.product_id)} (${row.quantity} sold)`,
            )
            .join(" · ") || "None"}
        </p>
      )}
    </>
  );
}
