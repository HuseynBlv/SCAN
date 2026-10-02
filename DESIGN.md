# Design System — SCAN

## Product Context

- **What this is:** SCAN turns retailer checkout exports into deterministic sales, basket,
  product, time, store, and synchronization insights.
- **Who it is for:** Medium-sized retailer owners and CCI Sales/Marketing users who need
  decision-ready information without using a BI tool.
- **Space:** Retail analytics, consumer packaged goods, and retailer data collaboration.
- **Project type:** Responsive analytics web application with separate retailer and CCI portals.
- **Memorable idea:** SCAN turns existing retailer checkout data into useful actions for both
  the retailer and CCI.

## Approved Direction

- **Variant:** A — restrained operational dashboard.
- **Mockup:** `/Users/huseynbva/.gstack/projects/HuseynBlv-SCAN/designs/design-system-20260830-scan/variant-A.png`
- **Direction:** Coca-Cola operational editorial.
- **Decoration:** Minimal and intentional. Typography, alignment, thin rules, and selective
  color provide hierarchy; decoration must not compete with data.
- **Mood:** Confident, clear, energetic, trustworthy, and suitable for everyday business use.
- **Reference principles:** Coca-Cola digital restraint, CCI corporate information design, and
  Apple-like hierarchy and low chrome. Do not copy Apple colors or Coca-Cola trademarks.

## Design Principles

1. **Briefing before exploration.** Overview answers what happened, what it means, and what
   action to consider before presenting deeper charts or tables.
2. **Red is a signal, not a surface.** Use SCAN red for branding, selection, emphasis, and
   primary analytical series. It should normally occupy less than 10% of a dashboard screen.
3. **Numerical truth is non-negotiable.** Never display forecasts, peer benchmarks, causal
   claims, period comparisons, or projected uplift unless the backend calculates and labels them.
4. **Shared product, distinct permissions.** Retailer and CCI portals use the same design
   language. Distinguish them through content, account context, and permissions, not unrelated
   color themes.
5. **Flat and precise.** Prefer surface contrast and thin borders to shadows, gradients, glow,
   glass effects, or excessive rounding.
6. **Actionable language.** Recommendations use Fact → Interpretation → Recommended Action.
   Suggested actions are tests, not promises of business impact.

## Typography

- **Display and headings:** Satoshi, weights 600 and 700. Until an official self-hostable
  Satoshi package or licensed font asset is added, the MVP uses self-hosted Geist as the
  heading fallback rather than loading an unpinned third-party font.
- **Body, UI, and data:** Geist, weights 400, 500, and 600. Enable tabular numerals for KPIs,
  tables, axes, dates, percentages, and currency.
- **Fallback:** headings use `Satoshi, Geist, Arial, sans-serif`; UI/data use
  `Geist, Arial, sans-serif`.
- **Loading:** Prefer self-hosted variable WOFF2 files or pinned font packages rather than
  runtime dependency on an unversioned font CDN.
- **Scale:**
  - Hero/presentation: 40px / 1.05 / 700
  - Page title: 32px / 1.12 / 700
  - Section title: 22px / 1.25 / 600
  - Card title: 16px / 1.35 / 600
  - Body: 15px / 1.5 / 400
  - UI label: 14px / 1.4 / 500
  - Caption/metadata: 12px / 1.4 / 500
  - KPI value: 32–38px / 1.05 / 600 with tabular numerals

## Color

- **Approach:** Restrained brand palette with independent semantic colors.
- **Brand red:** `#E61C24` — brand mark, active navigation rule, selected state, primary chart
  series, and rare high-priority emphasis.
- **Brand red active:** `#C9141C` — pressed state and high-contrast red text where needed.
- **Ink:** `#17181B` — primary text and dark actions.
- **Sidebar:** `#101214` — desktop navigation surface.
- **Canvas:** `#F4F4F2` — application background.
- **Surface:** `#FFFFFF` — panels, cards, tables, and inputs.
- **Muted text:** `#686C75` — secondary explanation and metadata.
- **Border:** `#DDE0E3` — panel, table, and input boundaries.
- **Subtle fill:** `#F7F7F5` — grouped rows and low-emphasis regions.
- **Success:** `#087F5B` — completed import, healthy mapping, positive status.
- **Warning:** `#B76E00` — incomplete or attention-needed state.
- **Information:** `#2563C9` — neutral informational state and comparison series.
- **Critical:** `#A50F17` — destructive or failed state; always pair with an icon and label so
  it is not confused with brand red.
- **On dark/on red:** `#FFFFFF`.
- **Dark mode:** Not part of the presentation MVP. If added later, redesign surfaces and chart
  contrast rather than mechanically inverting colors.

## Spacing

- **Base unit:** 8px.
- **Density:** Comfortable and scan-friendly, not Apple marketing-page spaciousness.
- **Scale:** 2xs(4), xs(8), sm(12), md(16), lg(24), xl(32), 2xl(48), 3xl(64).
- **Page gutters:** 32px desktop, 24px tablet, 16px mobile.
- **Panel padding:** 24px desktop, 16px mobile.
- **Section gap:** 24px.
- **Tight control gap:** 8–12px.

## Layout

- **Approach:** Grid-disciplined application with editorial hierarchy on Overview.
- **Desktop shell:** 232px sticky dark sidebar plus a fluid content area.
- **Content width:** Fluid up to 1600px. Keep analytical content left-aligned rather than
  centering a narrow marketing container.
- **Grid:** 12 columns desktop, 8 tablet, 4 mobile.
- **Primary breakpoints:** 1200px, 900px, 680px.
- **Border radius:** control 8px, panel 12px, compact status 9999px. Do not apply one large
  radius to every element.
- **Elevation:** No shadow by default. A subtle shadow is allowed only for menus, dialogs,
  mobile navigation overlays, and other truly floating layers.

## Product Information Architecture

- **CCI workspace:** Overview, Insights, Stores, Products, AI Assistant. Revised from the
  2026-09-30 My Work/Investigate/Activations/Network/Copilot layout as part of the 2026-10-02
  network-intelligence redesign: the retailer switcher is gone, and the default experience is
  aggregated across every retailer a CCI account can see (not one retailer at a time). A single
  store or product is a drill-down, never the primary unit of navigation. Investigate and
  Activations are no longer top-level destinations - investigation is an action taken from an
  Insight, a product row, or a My Work item (reusing the same Investigate detail view built in
  the 2026-09-30 redesign), and Activations stays reachable in code but out of the nav until a
  real end-to-end test-vs-control workflow exists. See the 2026-10-02 decisions below.
- **Retailer workspace:** Home, Offers, Actions, Insights, Partner. Revised from the original
  Today/Sales/Products/Alerts analytics-first layout: the retailer home page leads with
  connection status, SCAN benefits, and a recommended commercial offer, not sales charts.
  Analytics (the former Sales and Products pages) now live together under the secondary
  Insights page, supporting offers and actions rather than being the reason to open the app.
- **Data connection workspace:** Connections, Import data, Product mapping. This is a
  retailer-bound administrator surface and is not part of the CCI or retailer information architecture.
- **Retailer onboarding workspace:** Retailers with a guarded four-step flow: tenant/stores,
  named import format, no-write sample validation, and one-time credential issuance.
- The single-retailer basket/companion/daypart analysis and signal cards that used to live under
  CCI Network were retired with the Network nav item in the 2026-10-02 redesign rather than
  carried forward as-is, because they could not be made genuinely network-wide without new
  queries. That analytical depth is intended to return as part of the Product detail and Store
  detail pages (companion products, strongest daypart) called for by the same redesign, not as a
  restored Network page. Store-level data health now lives under Stores rather than as a
  top-level concern.
- Retailer synchronization issues and mapping-quality attention items surface on Home and
  Actions rather than a dedicated Alerts page, so shop owners see what requires attention where
  they already are instead of a fifth place to check.
- Copilot answers only questions it can ground in a real, deterministic tool call
  (comparePeriods/compareProducts/investigation lookup, etc.) - never a free-form language
  model. A question it cannot ground in real data receives an explicit "cannot answer
  reliably" state rather than an invented answer.

## Home Information Order

### CCI workspace (My Work)

1. Retailer scope, data freshness, and discreet demo-data disclosure.
2. A greeting stating how many real items need attention (or that nothing does) - not a KPI
   strip.
3. Needs Attention: detected changes (real recent-vs-prior movers) with no open investigation
   yet, each with an Investigate and an Ask Copilot action.
4. In Progress / Waiting on Team: open investigations and open field checks.
5. Recently Completed: closed investigations and finished field checks.
6. Meeting prep (Prepare a review) sits at the bottom - available, not competing with the
   items above for attention.
6. Recommended actions followed by data health and freshness.

### Retailer workspace

1. Greeting and connection status: store name, a live "Connected" indicator, and the shop's
   commercial standing (benefits this month, available offers, Partner status) as the three
   headline KPIs - not sales or revenue.
2. One recommended commercial offer, computed from the store's own recorded CCI product sales,
   as the single most visually prominent component on the page.
3. SCAN Benefits: this month, last month, and lifetime estimated commercial value, with a short
   list of where it came from.
4. POS connection status (last sync, lifetime transactions processed) and, only when relevant,
   a Needs-attention item grounded in synchronization or mapping data.
5. Deeper analytics (sales trend, best sellers, slow movers) live under the secondary Insights
   page and support the offers and actions above rather than leading the experience.

Do not display a metric merely to fill a card. Each visible value must support a likely user
decision or help establish data trust.

## Components

### Navigation

- Desktop navigation uses the dark sidebar with white text and a thin red active rule.
- Inactive labels use a muted light gray; hover adds a subtle translucent white fill.
- Mobile navigation becomes a compact drawer or bottom navigation. Preserve a 44px minimum
  target size.
- Retailer mobile navigation is a fixed four-item bottom bar. CCI uses a horizontally scrollable
  section bar at smaller widths because it remains desktop-first.

### Buttons

- Primary action: ink background, white text, 8px radius.
- Brand/selection action: red background only when the action is central to the current flow.
- Secondary action: white or transparent background with a 1px border.
- Text action: ink text with a directional icon; red is reserved for high-emphasis navigation.
- Pressed states use a color change or 1–2px translation, not dramatic scaling.

### Panels and KPI Cards

- White surface, 1px border, 12px radius, no default shadow.
- KPI strips may share one container with vertical dividers instead of becoming five isolated
  floating cards.
- Label first, value second, deterministic context third.
- Comparisons appear only when supplied by the analytics API with a defined denominator and
  comparison period.

### Charts

- Brand red is the primary series. Comparison series use gray or information blue.
- Use horizontal grid lines sparingly; avoid decorative chart backgrounds.
- Tooltips repeat the metric name, exact value, date/segment, and applicable unit.
- Chart color must not be the only carrier of meaning. Use labels, shapes, or line styles.
- Prefer one decision-relevant chart per panel over multiple tiny charts.

### Tables

- Right-align numbers; left-align names and categories.
- Use tabular numerals and consistent decimal/currency formatting.
- Prefer horizontal rules and restrained row highlighting to boxed cells.
- Preserve complete product names in accessible labels even when visible text is truncated.

### Status and Data Sync

- Data freshness must be visible without entering a settings page.
- Success, warning, and failure states include an icon, label, timestamp, and next action.
- Do not imply real-time synchronization when the source is a scheduled file export.

### Data Connection and Imports

- Distinguish working import paths, setup-required connector software, provisional adapters,
  and future integrations with explicit text labels.
- Use the actual import-job result for receipt, line, duplicate, unresolved-product, error,
  attempt, and completion values. Do not derive a mapping percentage from unlike units.
- The current upload API is synchronous, so show one honest processing state instead of simulated
  stage progress. Completed or failed stage markers appear only after the API responds.
- Browser uploads run a no-write preview first. The preview reports receipt, line, quantity, gross,
  discount, reported-net, calculated-net, difference, store, product, and date controls. Import
  requires the same file fingerprint and an unexpired preview.
- The onboarding operator configures the initial source-column mapping. Retailer-bound data
  administrators can correct their own assigned profile in the import workflow; saving a change
  returns the profile to draft until the same file validates again.
  Product mapping may be corrected through the implemented unresolved-product and catalog APIs.
- New retailers remain import-locked until a sample file passes the same parser and row validation
  used by production imports. Sample validation must never create receipts or product records.
- Show issued passwords once and explain that SCAN stores only password hashes. Never retain
  plaintext credentials in browser storage or display them after the operator leaves the result.

### Login and Portal Selection

- Remove decorative radial gradients and oversized card shadows.
- Use a clean split or centered layout on the warm canvas, with one controlled red brand moment.
- Keep portal switching visible but secondary.
- Credentials and privacy copy remain explicit and readable.

## Motion

- **Approach:** Minimal-functional.
- **Micro:** 120ms for hover, press, and focus transitions.
- **Short:** 180ms for tabs, filters, and small disclosures.
- **Medium:** 240ms for drawers, dialogs, and view transitions.
- **Easing:** enter `cubic-bezier(0.2, 0.8, 0.2, 1)`; exit `ease-in`; movement `ease-in-out`.
- Respect `prefers-reduced-motion`. Never animate KPI numbers in a way that delays reading.

## Accessibility

- Meet WCAG AA contrast for all text, controls, chart labels, and focus states.
- Every interactive element must have a visible keyboard focus indicator.
- Minimum target size is 44×44px on touch layouts.
- Do not encode positive/negative/status meaning with color alone.
- Use semantic headings, labeled controls, table headers, and meaningful chart alternatives.
- Loading, error, empty, and synchronization states must be announced appropriately.

## Responsive Behavior

- **≥1200px:** Full sidebar, KPI strip, two-column supporting analytics.
- **900–1199px:** Compact sidebar, wrapped KPI grid, stacked supporting panels.
- **680–899px:** Mobile navigation, two-column KPIs where space permits, charts above tables.
- **<680px:** Single-column briefing and KPIs, simplified axes, full-width controls and actions.
- Never hide core numerical information on mobile solely to preserve the desktop composition.

## Implementation Guardrails

- Reuse the existing React components and Recharts integration; do not rebuild the frontend.
- Centralize shared tokens so retailer and CCI CSS cannot override each other accidentally.
- Render only backend-provided deterministic metrics. The approved mockup is a layout reference,
  not authorization to invent comparison data or peer benchmarks.
- Keep retailer-specific and CCI-specific wording in their respective components while sharing
  visual primitives.
- Add regression tests for navigation, accessibility labels, loading/error/empty states, and
  any changed metric formatting.

## Decisions Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-08-30 | Adopt Variant A | Rated 5/5 and selected for its daily usability and presentation clarity. |
| 2026-08-30 | Use restrained Coca-Cola/CCI styling | Red remains distinctive when supported by black, white, and precise information design. |
| 2026-08-30 | Make Overview a decision briefing | Retailer owners and CCI users need actions, not a configurable BI canvas. |
| 2026-08-30 | Preserve numerical trust boundary | Visual polish must never introduce unsupported comparisons, forecasts, or causal claims. |
| 2026-09-13 | Separate opportunities from observed signals | Weak relationships and data-quality findings remain visible but cannot become the CCI home headline. |
| 2026-09-13 | Consolidate the two workspace navigation models | CCI is action-first with analysis under Explore; retailer is glanceable with Today, Sales, Products, and Alerts. |
| 2026-09-13 | Keep retailer intelligence operational and honest | Today leads with shop performance and actual data issues; stock and prior-period claims remain unavailable until those data contracts exist. |
| 2026-09-13 | Make data connection capability states explicit | Manual file import and product mapping are working; the folder connector requires installation, CASPOS is provisional, and unimplemented POS integrations remain clearly labeled. |
| 2026-09-30 | Rebuild CCI navigation as My Work / Investigate / Activations / Network / Copilot | Optimizes for "how much commercial work can someone complete without leaving SCAN," not "how many analytics features can we show" - per explicit user direction. Preserves the old Explore/Opportunities analytical depth under Network rather than deleting it. |
| 2026-09-30 | Copilot is deterministic tool-calls, not a live LLM | Reconciles the product's own "AI must never invent business data" requirement with the project's $0 budget - every answer traces to a real analytics function (ChangeDetectionService, InvestigationService), never free-form generation. |
| 2026-09-30 | Omit a "competitive substitution" hypothesis | SCAN has no competitor-product data source anywhere in its schema; a hypothesis claiming competitor behavior would not trace to real evidence, so the investigation engine only generates availability and placement/concentration hypotheses. |
| 2026-10-01 | Scope watchlists and activations to products only | ChangeDetectionService can only compute a real comparison for a product; a store/category/region watchlist or a multi-product activation would need comparison functions that don't exist yet, so neither pretends to support them. |
| 2026-10-01 | Activation results use difference-in-differences language, never causal language | Test and control stores are not randomly assigned, so "test stores moved N points more than control" is reported, never "the activation caused N%"; limitations (no randomization, sample size) are always shown alongside the finding. |
| 2026-10-01 | Role-aware personalization ships as two roles (Field Sales vs. everyone else), self-service | Per explicit user direction, over a six-role scheme: field tasks are the one thing that is meaningfully role-specific given what is built today (Activations has no Trade-Marketing-specific view yet, Category Manager has no category-level data yet). The account sets its own `commercialRole` as a UI preference, not an access boundary - tenant/retailer access stays governed entirely by TenantAccessService. |
| 2026-10-02 | Rebuild CCI navigation as Overview / Insights / Stores / Products / AI Assistant, removing the retailer switcher | Per explicit user direction: the product becomes network-level commercial intelligence, not per-retailer dashboards switched by hand. A new `network` backend package generalizes every query to a list of retailer IDs (`TenantAccessService.cciRetailers`) so Overview/Insights/Stores/Products are genuinely aggregated across every retailer a CCI account can see, with no `retailerCode` parameter anywhere in that API surface. |
| 2026-10-02 | Investigate and Activations stay in the code but leave the top-level nav | Investigation is now an action taken from an Insight, a product row, or a My Work item, not a destination you browse to - the existing Investigate detail view (What changed / Possible explanations / Evidence / Next steps) is reused unchanged. Activations has no real end-to-end test-vs-control workflow yet (per the 2026-10-01 decision above), so it is intentionally unreachable from the UI until one exists, rather than kept as a permanent nav item with no live entry point. |
| 2026-10-02 | My Work's real-time task content (field checks, watchlist, in-progress investigations, meeting brief) is embedded inside Overview rather than kept as its own page | The redesign's nav has exactly five items and none of them is "My Work" - folding its content into the bottom of Overview (labeled "Your work") keeps every Phase 1/2 feature reachable without adding a sixth nav destination the spec did not call for. |
| 2026-10-02 | The AI Commercial Brief and Insights feed surface at most 3 real items, generated the same way InsightRules/ChangeDetectionService already work | Up to one real decline (with store-concentration share), one real gain, and one data-quality note when mapping coverage is below 90% - never a fabricated fourth item, and never a vague "everything is fine" empty state (it states the actual stable numbers instead). |
| 2026-10-02 | Store detail and Product detail ship as P1's first slice, reusing the network package rather than a new one | Clicking a store or product row anywhere (Stores, Products, Overview previews) now opens a real detail page instead of nothing - new `storeDetail`/`productDetail` endpoints extend `NetworkAnalyticsService` with store-scoped and product-scoped SQL (top products, biggest changes, companion categories/products, a real "similar stores" comparison by closest current penetration, and a daypart claim only when at least 5 receipts support it). "Compare with similar stores" and "Investigate this product" reuse existing real data/flows rather than inventing new ones. |
| 2026-10-02 | Product/store revenue is computed network-wide but deliberately not shown as a single currency figure anywhere in the UI | Retailers on the network can use different currencies; summing `line_total` across them into one number would silently mix currencies. The backend still returns `recentRevenue`/`priorRevenue` for future per-currency use, but no frontend page renders it as money today. |
| 2026-10-02 | Comparison mode ships as Store vs. Store and Product vs. Product only, reached from the detail pages rather than a new nav item | Region vs. Region has no real backing data (`Store` has no region column), and a real network-wide Daypart vs. Daypart needs more backend work than this slice; neither is faked. The two shipped modes reuse the existing `storeDetail`/`productDetail` fetch for both sides - a difference is just arithmetic on two already-real numbers, so no new comparison endpoint exists. No written "AI explanation" of the difference is generated yet (no COMPARISON context in CopilotService); the page says so rather than inventing one. |
