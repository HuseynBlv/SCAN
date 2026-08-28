# SCAN Phase 0 Analytics Definitions

All numeric facts are calculated deterministically from validated canonical receipts.
Unmapped products are never guessed to be CCI products.

## Metrics

### Total baskets

Count of distinct persisted receipts for the selected retailer.

### CCI baskets

Count of distinct receipts containing at least one transaction line whose canonical
product has `is_cci = true`.

### CCI basket penetration

```text
CCI baskets / total baskets × 100
```

The result can be understated when product mapping coverage is incomplete.

### Average basket value

```text
sum(receipt basket value) / total baskets
```

Receipt basket value is the sum of imported line totals. The real retailer must confirm
that line total represents final paid value consistently.

SCAN does not perform currency conversion. If one retailer's persisted receipts contain
more than one currency, the analytics request fails explicitly rather than returning an
invalid combined basket value or revenue total.

### Companion attachment rate

For the Phase 0 network-level companion list:

```text
CCI baskets containing mapped non-CCI companion / all CCI baskets × 100
```

Products are counted once per basket even when quantity is greater than one. Unmapped
products are excluded from companion rankings.

### Mapping coverage

```text
transaction lines linked to any canonical product / all transaction lines × 100
```

### CCI SKU performance

For each mapped CCI SKU:

- stable canonical product ID and display name;
- distinct basket count;
- sum of imported quantity;
- sum of imported line total as revenue.

### Dayparts

Calculated in the retailer timezone:

- `MORNING`: 06:00–10:59
- `MIDDAY`: 11:00–14:59
- `AFTERNOON`: 15:00–17:59
- `EVENING`: 18:00–21:59
- `NIGHT`: 22:00–05:59

These boundaries are provisional and require CCI confirmation.

### Weekday/weekend

Saturday and Sunday are weekend; all other days are weekday. This is provisional.

## Insight rules

Insights always contain Fact → Interpretation → Recommended Action.

- Fewer than five baskets produces only a data-coverage recommendation.
- Companion actions require a calculated companion and at least five total baskets.
- A daypart action requires at least 35% of validated baskets in one daypart.
- Mapping below 90% produces a mapping-quality warning.
- Promotion effectiveness is not calculated because Phase 0 has no promotion identifier.
