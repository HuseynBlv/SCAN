# Changelog

All notable changes to SCAN are documented in this file.

## [0.1.0.0] - 2026-09-10

### Added

- Import the observed CASPOS CloudSale Excel receipt format through an explicitly enabled,
  fail-closed connector adapter that produces SCAN's canonical transaction fields.
- Validate CloudSale workbooks offline and run the connector on Windows using supervised or
  continuous launch scripts.
- Provision a sharing-disabled `CASPOS_PILOT` retailer, `CLOUDSALE_V1` profile, and separate
  Render application service using dedicated ingest and dashboard credentials.
- Follow a practical shop-visit runbook covering evidence collection, configuration, safe testing,
  reconciliation, retries, duplicate receipts, unsupported returns, and operational boundaries.

### Changed

- Normalize offset timestamps to `Asia/Baku` for the provisional pilot profile and remove cashier,
  payment, category, and tax fields before upload.
- Convert source files through a pluggable adapter while preserving the existing canonical-file
  connector behavior.
