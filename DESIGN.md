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

## Overview Information Order

1. Page title, retailer/account context, period, and store filter.
2. **Three things to know** briefing.
3. Primary KPI strip.
4. One dominant trend visualization.
5. Supporting product, category, store, or basket evidence.
6. Recommended actions.
7. Data synchronization and freshness status.

Do not display a metric merely to fill a card. Each visible value must support a likely user
decision or help establish data trust.

## Components

### Navigation

- Desktop navigation uses the dark sidebar with white text and a thin red active rule.
- Inactive labels use a muted light gray; hover adds a subtle translucent white fill.
- Mobile navigation becomes a compact drawer or bottom navigation. Preserve a 44px minimum
  target size.

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
