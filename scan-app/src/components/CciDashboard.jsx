import { useEffect, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ScanApiError,
  configuredRetailerCode,
  fetchOverview,
} from "../services/scanApi";
import { compactChartLabel } from "./chartLabels";
import ScanBrand from "./ScanBrand";
import ScanIcon from "./ScanIcon";
import { usePretextLayout } from "./usePretextLayout";
import "./CciDashboard.css";

const NAV_ITEMS = [
  { id: "overview", label: "Overview", icon: "overview" },
  { id: "basket", label: "Basket Analysis", icon: "basket" },
  { id: "products", label: "Product Performance", icon: "products" },
  { id: "time-store", label: "Time & Store", icon: "time-store" },
  { id: "recommendations", label: "Recommendations", icon: "recommendations" },
];

const integerFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const decimalFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

function formatInteger(value) {
  return integerFormatter.format(Number(value || 0));
}

function formatDecimal(value) {
  return decimalFormatter.format(Number(value || 0));
}

function formatPercent(value) {
  return `${formatDecimal(value)}%`;
}

function formatMoney(value, currency) {
  const amount = Number(value || 0);
  if (!currency || currency === "N/A" || currency === "MULTI") {
    return `${amount.toFixed(2)} ${currency || ""}`.trim();
  }

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function formatGeneratedAt(value) {
  if (!value) {
    return "Not available";
  }
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function humanizeSegment(value) {
  return `${value || ""}`
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (character) => character.toUpperCase());
}

function EmptyState({ title, children }) {
  return (
    <div className="cci-empty-state">
      <div className="cci-empty-icon" aria-hidden="true">○</div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

function Login({ error, loading, onSubmit }) {
  const [username, setUsername] = useState("scan-cci");
  const [password, setPassword] = useState("");
  const [retailerCode, setRetailerCode] = useState(configuredRetailerCode);

  function submit(event) {
    event.preventDefault();
    onSubmit({
      username: username.trim(),
      password,
      retailerCode: retailerCode.trim().toUpperCase(),
    });
  }

  return (
    <main className="cci-login-shell">
      <section className="cci-login-card" aria-labelledby="cci-login-title">
        <ScanBrand subtitle="Sales & Consumption Analytics Network" />
        <div className="cci-login-copy">
          <span className="cci-eyebrow">CCI Sales & Marketing</span>
          <h1 id="cci-login-title">Basket intelligence, ready for action.</h1>
          <p>
            Sign in to view retailer-approved aggregate analytics. Credentials remain only
            in this browser tab and are not saved by SCAN.
          </p>
        </div>
        <form className="cci-login-form" onSubmit={submit}>
          <label>
            Retailer code
            <input
              autoCapitalize="characters"
              autoComplete="organization"
              required
              value={retailerCode}
              onChange={(event) => setRetailerCode(event.target.value)}
            />
          </label>
          <label>
            Username
            <input
              autoComplete="username"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label>
            Password
            <input
              autoComplete="current-password"
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? <div className="cci-form-error" role="alert">{error}</div> : null}
          <button className="cci-primary-button" disabled={loading} type="submit">
            {loading ? "Connecting…" : "Open analytics"}
          </button>
        </form>
        <a className="portal-switch-link" href="/?portal=retailer">Retailer owner portal <span aria-hidden="true">→</span></a>
      </section>
    </main>
  );
}

function KpiCard({ label, value, note, status }) {
  return (
    <article className={`cci-kpi-card ${status ? `is-${status}` : ""}`}>
      <div className="cci-kpi-label">{label}</div>
      <div className="cci-kpi-value">{value}</div>
      <div className="cci-kpi-note">{note}</div>
    </article>
  );
}

function DecisionBriefing({ insights, onNavigate }) {
  const visibleInsights = insights.slice(0, 3);
  return (
    <section className="cci-panel cci-briefing" aria-labelledby="cci-briefing-title">
      <div className="cci-section-heading compact cci-briefing-heading">
        <div className="cci-heading-with-icon">
          <span className="cci-heading-icon"><ScanIcon name="pulse" /></span>
          <h2 id="cci-briefing-title">Three things to know</h2>
        </div>
        {insights.length ? (
          <button className="cci-text-button" type="button" onClick={() => onNavigate("recommendations")}>
            View all actions <ScanIcon name="chevron" size={16} />
          </button>
        ) : null}
      </div>
      {visibleInsights.length ? (
        <div className={`cci-briefing-grid count-${visibleInsights.length}`}>
          {visibleInsights.map((insight, index) => (
            <article className="cci-briefing-item" key={`${insight.fact}-${index}`}>
              <span className={`cci-briefing-number tone-${index + 1}`}>{index + 1}</span>
              <div>
                <h3 data-pretext>{insight.fact}</h3>
                <p data-pretext>{insight.interpretation}</p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState title="No reliable briefing yet">
          Import complete baskets and map products before SCAN highlights a decision.
        </EmptyState>
      )}
    </section>
  );
}

function CompanionSummary({ data, onNavigate }) {
  return (
    <section className="cci-panel cci-overview-table-panel">
      <div className="cci-section-heading compact"><h2>Top companion products</h2></div>
      {data.topCompanionProducts.length ? (
        <div className="cci-table-scroll">
          <table className="cci-table cci-compact-table" aria-label="Top companion products">
            <thead><tr><th>#</th><th>Product</th><th>CCI baskets</th><th>Attachment</th></tr></thead>
            <tbody>{data.topCompanionProducts.slice(0, 5).map((item, index) => (
              <tr key={`${item.name}-${index}`}>
                <td>{index + 1}</td>
                <td title={item.name}>{item.name}</td>
                <td>{formatInteger(item.basketCount)}</td>
                <td>{formatPercent(item.attachmentRatePercentage)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <EmptyState title="No companion products">More mapped CCI baskets are required.</EmptyState>}
      <button className="cci-panel-link" type="button" onClick={() => onNavigate("basket")}>
        Open Basket Analysis <ScanIcon name="chevron" size={16} />
      </button>
    </section>
  );
}

function CciActionsSummary({ insights, onNavigate }) {
  return (
    <section className="cci-panel cci-actions-summary">
      <div className="cci-section-heading compact"><h2>Recommended actions</h2></div>
      {insights.length ? (
        <div className="cci-action-rows">
          {insights.slice(0, 2).map((insight, index) => (
            <article className="cci-action-row" key={`${insight.recommendedAction}-${index}`}>
              <span className={`cci-action-icon tone-${index + 1}`}><ScanIcon name={index ? "products" : "chart"} /></span>
              <div>
                <h3 data-pretext>{insight.recommendedAction}</h3>
                <p data-pretext>{insight.fact}</p>
              </div>
              <button
                aria-label={`View recommendation: ${insight.recommendedAction}`}
                className="cci-small-button"
                type="button"
                onClick={() => onNavigate("recommendations")}
              >
                View details
              </button>
            </article>
          ))}
        </div>
      ) : <p className="cci-muted-copy">Recommendations appear after reliable patterns are available.</p>}
      <button className="cci-panel-link" type="button" onClick={() => onNavigate("recommendations")}>
        View all recommendations <ScanIcon name="chevron" size={16} />
      </button>
    </section>
  );
}

function DataTrustSummary({ data }) {
  const healthy = data.mappedLinePercentage >= 90;
  return (
    <section className="cci-panel cci-sync-summary">
      <div className="cci-section-heading compact"><h2>Data confidence</h2></div>
      <div className="cci-sync-summary-body">
        <span className={`cci-sync-icon ${healthy ? "is-healthy" : "is-warning"}`}>
          <ScanIcon name={healthy ? "check" : "warning"} size={30} />
        </span>
        <div>
          <h3>{healthy ? "Analysis-ready mapping" : "Mapping needs review"}</h3>
          <p>{formatPercent(data.mappedLinePercentage)} of imported lines are mapped.</p>
          <p>Generated {formatGeneratedAt(data.generatedAt)}</p>
          <span className={`cci-status-badge ${healthy ? "is-healthy" : "is-warning"}`}>
            {healthy ? "Reliable coverage" : "Review coverage"}
          </span>
        </div>
      </div>
    </section>
  );
}

function Overview({ data, onNavigate }) {
  const mappingHealthy = data.mappedLinePercentage >= 90;

  if (data.totalBaskets === 0) {
    return (
      <div className="cci-page-stack">
        <section className="cci-panel">
          <EmptyState title="No transaction data imported yet">
            Ask the SCAN administrator to import a validated retailer export for {data.retailerCode}.
            Derived KPIs will appear only after at least one complete receipt is available.
          </EmptyState>
        </section>
      </div>
    );
  }

  return (
    <div className="cci-page-stack">
      <DecisionBriefing insights={data.insights} onNavigate={onNavigate} />

      <section className="cci-kpi-grid" aria-label="Retailer KPIs">
        <KpiCard
          label="Total baskets"
          value={formatInteger(data.totalBaskets)}
          note="Validated, reconstructed receipts"
        />
        <KpiCard
          label="Baskets with CCI"
          value={formatInteger(data.cciBaskets)}
          note="At least one mapped CCI product"
        />
        <KpiCard
          label="CCI basket penetration"
          value={formatPercent(data.cciPenetrationPercentage)}
          note="Share of all validated baskets"
        />
        <KpiCard
          label="Average basket value"
          value={formatMoney(data.averageBasketValue, data.currency)}
          note="After line-level discounts"
        />
        <KpiCard
          label="Product mapping coverage"
          value={formatPercent(data.mappedLinePercentage)}
          note={mappingHealthy ? "Healthy for analysis" : "Review unmapped products"}
          status={mappingHealthy ? "healthy" : "warning"}
        />
      </section>

      <section className="cci-overview-primary-grid">
        <section className="cci-panel cci-overview-chart-panel">
          <div className="cci-section-heading compact">
            <div><h2>Companion category signal</h2><p>Attachment rate within mapped CCI baskets</p></div>
          </div>
          <CompanionChart
            data={data.topCompanionCategories}
            dataKey="attachmentRatePercentage"
            nameKey="category"
            chartLabel="Leading companion category attachment rates"
            emptyTitle="No companion categories"
          />
        </section>
        <CompanionSummary data={data} onNavigate={onNavigate} />
      </section>

      <section className="cci-overview-secondary-grid">
        <CciActionsSummary insights={data.insights} onNavigate={onNavigate} />
        <DataTrustSummary data={data} />
      </section>
    </div>
  );
}

function CompanionChart({ data, dataKey, nameKey, chartLabel, emptyTitle }) {
  if (!data.length) {
    return (
      <EmptyState title={emptyTitle}>
        Companion results appear after baskets contain mapped CCI and non-CCI products.
      </EmptyState>
    );
  }

  return (
    <div className="cci-chart" aria-label={chartLabel} role="img">
      <ResponsiveContainer
        width="100%"
        height="100%"
        minWidth={0}
        minHeight={300}
        initialDimension={{ width: 500, height: 350 }}
      >
        <BarChart data={data.slice(0, 8)} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 20 }}>
          <CartesianGrid horizontal={false} stroke="rgba(18, 18, 18, 0.08)" strokeDasharray="3 3" />
          <XAxis
            axisLine={false}
            domain={[0, "dataMax"]}
            tickFormatter={(value) => `${value}%`}
            tickLine={false}
            type="number"
          />
          <YAxis
            axisLine={false}
            dataKey={nameKey}
            tick={{ fill: "#545861", fontSize: 12 }}
            tickFormatter={compactChartLabel}
            tickLine={false}
            type="category"
            width={138}
          />
          <Tooltip formatter={(value) => [formatPercent(value), "Attachment rate"]} />
          <Bar dataKey={dataKey} fill="#e61c24" radius={[0, 8, 8, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function BasketAnalysis({ data }) {
  return (
    <div className="cci-page-stack">
      <section className="cci-page-intro">
        <span className="cci-eyebrow">Basket Analysis</span>
        <h2>What appears alongside CCI products?</h2>
        <p>Attachment rate is the share of mapped CCI baskets containing the companion.</p>
      </section>
      <section className="cci-two-column charts">
        <div className="cci-panel">
          <div className="cci-section-heading compact"><h2>Top companion products</h2></div>
          <CompanionChart
            data={data.topCompanionProducts}
            dataKey="attachmentRatePercentage"
            nameKey="name"
            chartLabel="Companion product attachment rates"
            emptyTitle="No companion products"
          />
        </div>
        <div className="cci-panel">
          <div className="cci-section-heading compact"><h2>Top companion categories</h2></div>
          <CompanionChart
            data={data.topCompanionCategories}
            dataKey="attachmentRatePercentage"
            nameKey="category"
            chartLabel="Companion category attachment rates"
            emptyTitle="No companion categories"
          />
        </div>
      </section>
      <section className="cci-panel">
        <div className="cci-section-heading compact"><h2>Companion product detail</h2></div>
        <MetricTable
          columns={["Product", "CCI baskets", "Attachment rate"]}
          empty="No companion products are available."
          rows={data.topCompanionProducts.map((item) => [
            item.name,
            formatInteger(item.basketCount),
            formatPercent(item.attachmentRatePercentage),
          ])}
        />
      </section>
      <section className="cci-panel">
        <div className="cci-section-heading compact"><h2>Companion category detail</h2></div>
        <MetricTable
          columns={["Category", "CCI baskets", "Attachment rate"]}
          empty="No companion categories are available."
          rows={data.topCompanionCategories.map((item) => [
            item.category,
            formatInteger(item.basketCount),
            formatPercent(item.attachmentRatePercentage),
          ])}
        />
      </section>
    </div>
  );
}

function MetricTable({ columns, rows, empty }) {
  if (!rows.length) {
    return <EmptyState title="No results">{empty}</EmptyState>;
  }

  return (
    <div className="cci-table-scroll">
      <table className="cci-table">
        <thead>
          <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`${row[0]}-${rowIndex}`}>
              {row.map((cell, cellIndex) => <td key={`${cellIndex}-${cell}`}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProductPerformance({ data }) {
  const totalRevenue = data.cciSkuPerformance.reduce(
    (total, item) => total + Number(item.revenue || 0),
    0
  );
  const totalQuantity = data.cciSkuPerformance.reduce(
    (total, item) => total + Number(item.quantity || 0),
    0
  );

  return (
    <div className="cci-page-stack">
      <section className="cci-page-intro">
        <span className="cci-eyebrow">Product Performance</span>
        <h2>Compare mapped CCI SKUs</h2>
        <p>Revenue and quantity come directly from imported transaction lines.</p>
      </section>
      <section className="cci-kpi-grid compact">
        <KpiCard label="Mapped CCI SKUs" value={formatInteger(data.cciSkuPerformance.length)} note="Distinct normalized products" />
        <KpiCard label="CCI units" value={formatDecimal(totalQuantity)} note="Imported line quantities" />
        <KpiCard label="CCI revenue" value={formatMoney(totalRevenue, data.currency)} note="Sum of CCI line totals" />
      </section>
      <section className="cci-panel">
        <div className="cci-section-heading compact"><h2>SKU comparison</h2></div>
        <MetricTable
          columns={["CCI SKU", "Baskets", "Quantity", `Revenue (${data.currency})`]}
          empty="No mapped CCI SKU appears in the imported baskets."
          rows={data.cciSkuPerformance.map((item) => [
            item.product,
            formatInteger(item.basketCount),
            formatDecimal(item.quantity),
            formatMoney(item.revenue, data.currency),
          ])}
        />
      </section>
    </div>
  );
}

function SegmentBars({ segments }) {
  if (!segments.length) {
    return <EmptyState title="No segment data">Validated timestamp data is required.</EmptyState>;
  }

  return (
    <div className="cci-segment-list">
      {segments.map((segment) => (
        <div className="cci-segment-row" key={segment.segment}>
          <div className="cci-segment-heading">
            <span>{humanizeSegment(segment.segment)}</span>
            <strong>{formatPercent(segment.sharePercentage)}</strong>
          </div>
          <div className="cci-progress-track">
            <div className="cci-progress-fill" style={{ width: `${Math.min(Number(segment.sharePercentage), 100)}%` }} />
          </div>
          <small>{formatInteger(segment.basketCount)} baskets</small>
        </div>
      ))}
    </div>
  );
}

function TimeAndStore({ data }) {
  return (
    <div className="cci-page-stack">
      <section className="cci-page-intro">
        <span className="cci-eyebrow">Time & Store</span>
        <h2>When and where baskets occur</h2>
        <p>All timestamps use the retailer profile timezone; store IDs remain source-system identifiers.</p>
      </section>
      <section className="cci-two-column">
        <div className="cci-panel">
          <div className="cci-section-heading compact"><h2>Daypart mix</h2></div>
          <SegmentBars segments={data.dayparts} />
        </div>
        <div className="cci-panel">
          <div className="cci-section-heading compact"><h2>Weekday vs weekend</h2></div>
          <SegmentBars segments={data.weekdayWeekend} />
        </div>
      </section>
      <section className="cci-panel">
        <div className="cci-section-heading compact">
          <div>
            <h2>Store comparison</h2>
            <p>{formatInteger(data.stores.length)} stores in this dataset</p>
          </div>
        </div>
        <MetricTable
          columns={["Store", "Baskets", "CCI baskets", "CCI penetration", "Average basket"]}
          empty="No store-level aggregates are available."
          rows={data.stores.map((store) => [
            store.storeId,
            formatInteger(store.basketCount),
            formatInteger(store.cciBasketCount),
            formatPercent(store.cciPenetrationPercentage),
            formatMoney(store.averageBasketValue, data.currency),
          ])}
        />
      </section>
    </div>
  );
}

function Recommendations({ data }) {
  return (
    <div className="cci-page-stack">
      <section className="cci-page-intro">
        <span className="cci-eyebrow">Recommendations</span>
        <h2>Actions supported by observed basket facts</h2>
        <p>Recommendations are deterministic templates. Numerical truth comes from the analytics engine.</p>
      </section>
      {data.insights.length ? (
        <section className="cci-recommendation-list">
          {data.insights.map((insight, index) => (
            <article className="cci-recommendation" key={`${insight.fact}-${index}`}>
              <div className="cci-recommendation-index">Action {index + 1}</div>
              <div className="cci-recommendation-grid">
                <div>
                  <div className="cci-insight-label">Fact</div>
                  <h3>{insight.fact}</h3>
                  <div className="cci-insight-label">Interpretation</div>
                  <p>{insight.interpretation}</p>
                </div>
                <div className="cci-action-panel">
                  <div className="cci-insight-label">Recommended action</div>
                  <p>{insight.recommendedAction}</p>
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="cci-panel">
          <EmptyState title="No reliable recommendation yet">
            More complete, mapped baskets are required before SCAN suggests a commercial action.
          </EmptyState>
        </section>
      )}
    </div>
  );
}

function DashboardPage({ activePage, data, onNavigate }) {
  if (data.totalBaskets === 0) return <Overview data={data} onNavigate={onNavigate} />;
  if (activePage === "basket") return <BasketAnalysis data={data} />;
  if (activePage === "products") return <ProductPerformance data={data} />;
  if (activePage === "time-store") return <TimeAndStore data={data} />;
  if (activePage === "recommendations") return <Recommendations data={data} />;
  return <Overview data={data} onNavigate={onNavigate} />;
}

export default function CciDashboard() {
  const [credentials, setCredentials] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [activePage, setActivePage] = useState("overview");
  const [refreshKey, setRefreshKey] = useState(0);
  const layoutRef = useRef(null);

  usePretextLayout(layoutRef, `${activePage}:${data?.generatedAt || "login"}`);

  useEffect(() => {
    if (!credentials) {
      return undefined;
    }

    const controller = new AbortController();
    fetchOverview({ ...credentials, signal: controller.signal })
      .then((overview) => {
        if (!controller.signal.aborted) {
          setData(overview);
        }
      })
      .catch((requestError) => {
        if (!controller.signal.aborted && requestError?.name !== "AbortError") {
          setError(requestError?.message || "Unable to load SCAN analytics.");
          if (requestError instanceof ScanApiError && [401, 403].includes(requestError.status)) {
            setData(null);
          }
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [credentials, refreshKey]);

  function refresh() {
    setLoading(true);
    setError("");
    setRefreshKey((current) => current + 1);
  }

  function signOut() {
    setCredentials(null);
    setData(null);
    setError("");
    setLoading(false);
    setActivePage("overview");
  }

  if (!credentials || (!data && error)) {
    return (
      <Login
        error={error}
        loading={loading}
        onSubmit={(nextCredentials) => {
          setData(null);
          setError("");
          setLoading(true);
          setCredentials(nextCredentials);
          setRefreshKey((current) => current + 1);
        }}
      />
    );
  }

  if (!data) {
    return (
      <main className="cci-loading-shell" aria-live="polite">
        <div className="cci-loading-mark">S</div>
        <h1>Loading retailer analytics…</h1>
        <p>SCAN is calculating deterministic basket metrics.</p>
      </main>
    );
  }

  const activeLabel = NAV_ITEMS.find((item) => item.id === activePage)?.label || "Overview";

  return (
    <div className="cci-dashboard-shell" ref={layoutRef}>
      <aside className="cci-sidebar">
        <ScanBrand inverted subtitle="CCI Intelligence" />
        <nav className="cci-nav" aria-label="CCI analytics">
          {NAV_ITEMS.map((item) => (
            <button
              aria-current={activePage === item.id ? "page" : undefined}
              className={activePage === item.id ? "active" : ""}
              disabled={data.totalBaskets === 0 && item.id !== "overview"}
              key={item.id}
              onClick={() => setActivePage(item.id)}
              type="button"
            >
              <ScanIcon name={item.icon} /><span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="cci-sidebar-footer">
          <div className="cci-account-row"><span className="cci-account-avatar">CCI</span><div><strong>CCI Sales & Marketing</strong><small>Aggregate view</small></div></div>
          <p><ScanIcon name="shield" size={15} /> No customer or payment identifiers</p>
          <button className="cci-sidebar-signout" type="button" onClick={signOut}><ScanIcon name="signout" /> Sign out</button>
        </div>
      </aside>

      <main className="cci-main">
        <header className="cci-topbar">
          <div>
            <span className="cci-mobile-page">{activeLabel}</span>
            <h1>Basket intelligence for <span>{data.retailerName}</span></h1>
            <p>CCI workspace · Generated {formatGeneratedAt(data.generatedAt)}</p>
          </div>
          <div className="cci-topbar-actions">
            <div className="cci-retailer-pill">{data.retailerCode}</div>
            <button
              className="cci-secondary-button"
              disabled={loading}
              onClick={refresh}
              type="button"
            >
              <ScanIcon name="refresh" size={17} />{loading ? "Refreshing…" : "Refresh"}
            </button>
            <button
              aria-label="Sign out from SCAN"
              className="cci-signout-button"
              onClick={signOut}
              type="button"
            >
              <ScanIcon name="signout" size={19} />
            </button>
          </div>
        </header>

        <div className="cci-mobile-nav" aria-label="CCI analytics sections">
          {NAV_ITEMS.map((item) => (
            <button
              aria-current={activePage === item.id ? "page" : undefined}
              className={activePage === item.id ? "active" : ""}
              disabled={data.totalBaskets === 0 && item.id !== "overview"}
              key={item.id}
              onClick={() => setActivePage(item.id)}
              type="button"
            >
              <ScanIcon name={item.icon} size={17} />{item.label}
            </button>
          ))}
        </div>

        {credentials.retailerCode === "KAGGLE" ? (
          <div className="cci-demo-notice">
            <strong>Technical demo dataset.</strong> These results validate SCAN’s workflow;
            they are not current CCI or retailer market evidence.
          </div>
        ) : null}
        {error ? (
          <div className="cci-inline-error" role="alert">
            <span>{error}</span>
            <button type="button" onClick={refresh}>Retry</button>
          </div>
        ) : null}

        <DashboardPage activePage={activePage} data={data} onNavigate={setActivePage} />
      </main>
    </div>
  );
}
