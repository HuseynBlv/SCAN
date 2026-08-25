# SCAN Pilot Data Contract

Status: Phase 0 synthetic contract. Replace retailer-specific assumptions only after a
sanitized export has been reviewed.

## Canonical transaction line

Each source row represents one product line inside one receipt.

| Field | Required | Phase 0 rule |
|---|---:|---|
| `store_id` | yes | Stable identifier within the retailer |
| `receipt_id` | yes | Combined with retailer, store, and timestamp for Phase 0 identity |
| `transaction_timestamp` | yes | Parsed using the retailer import profile and converted to UTC |
| `product_code` | no | Preferred retailer-specific product identity |
| `barcode` | no | Used for exact canonical product matching |
| `product_name` | yes | Preserved exactly for audit and unresolved-product review |
| `quantity` | yes | Plain decimal greater than zero; returns are not inferred |
| `unit_price` | yes | Plain decimal; semantics require retailer confirmation |
| `discount_amount` | yes | Non-negative line-level value in Phase 0 |
| `line_total` | yes | Non-negative final line contribution to basket value |

The application adds `retailer_id`, `source_system`, `source_import_job_id`, and
`source_row_number` during ingestion.

## Import behavior

1. Calculate SHA-256 for the uploaded bytes.
2. Return the original import job if the same retailer uploads identical bytes again.
3. Parse the first XLS/XLSX worksheet or the complete UTF-8 CSV file.
4. Validate every required header and every row.
5. Write no receipt data if any row is malformed.
6. Group valid lines by store, receipt ID, and timestamp.
7. Calculate a deterministic fingerprint from the complete sorted basket contents.
8. Skip an existing receipt with the same identity and fingerprint.
9. Fail the entire import if the same receipt identity has different contents.
10. Preserve unresolved retailer products for manual mapping.

## Product matching order

1. Previously saved retailer product mapping, identified by retailer product code.
2. Exact barcode against the canonical product catalog.
3. Manual mapping.
4. Otherwise unresolved.

No fuzzy or AI matching is performed.

## Questions the real export must answer

- Is receipt ID unique per retailer, store, terminal, business day, or another scope?
- Can a completed receipt later be changed, voided, or cancelled?
- How are returns and negative quantities represented?
- Does line total include tax and reflect all discounts?
- Can receipt-level discounts exist without being allocated to lines?
- What encoding, delimiter, decimal separator, and timestamp formats are used?
- Are product codes stable when names or barcodes change?
- Can exports overlap, and how large are normal files?
