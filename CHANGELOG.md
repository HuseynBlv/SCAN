# Changelog

All notable changes to SCAN are documented in this file.

## [0.3.0.0] - 2026-10-09

### Added

- Explore SCAN through a responsive public landing page with retailer and enterprise product
  previews, transaction-to-intelligence storytelling, and an accessible interactive showcase.

### Changed

- Open the CCI workspace explicitly through `/?portal=cci` while keeping `/` available as the
  public entry point and preserving the existing retailer, connection, onboarding, and legacy
  scanner routes.
- Keep public capability claims honest by marking promotion analysis as planned and labeling
  demonstration metrics as illustrative.
- Update deployment documentation and container smoke checks for the new public entry point.

## [0.2.0.0] - 2026-09-11

### Added

- Open the CCI HQ dashboard with `CASPOS_PILOT` preselected through a retailer-specific URL.

### Changed

- Allow the CCI role to read retailer-approved aggregate analytics for the CASPOS pilot without a
  second export or synchronization job.
- Document the CCI login path and the product-mapping requirement for CCI-specific analysis.

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
