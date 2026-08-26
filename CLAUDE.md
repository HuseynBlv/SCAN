# SCAN project context

Read `README.md` for the retailer-export pivot, supported features, and pilot limitations.
Preserve the legacy scanner; it is not the current ingestion path. Numerical analytics must
remain deterministic. Do not commit credentials, raw exports, or generated datasets.

## Deploy Configuration (configured by /setup-deploy)

- **Platform:** one Render Free Docker web service, with external Neon Free PostgreSQL.
- **Production URL:** pending resource creation and verification; no Render deployment is
  currently recorded as live. Do not infer a URL from the service name.
- **Project type:** React web app and Spring Boot API served from one HTTPS origin.
- **Configuration:** root `Dockerfile`, `render.yaml`, and the Spring `cloud` profile.
- **Deploy trigger:** manual from Render after GitHub CI passes; service auto-deploy is off.
  Review Blueprint syncs too, because configuration changes can trigger deployment.
- **Initial branch:** `codex/phase-1-kaggle-cci-dashboard`. After an approved merge, update
  both the manifest and Render service to `main` before deleting the feature branch.
- **Health check:** `GET /health` returns only `{"status":"UP"}`. This is liveness, not
  database readiness; verify authenticated analytics separately.
- **Merge policy:** reviewed PR, with hosted verification and the existing Vercel production
  routing issue resolved before merging PR #2. Do not merge or deploy automatically.
- **Budget:** $0. No paid services, disks, upgrades, payment methods, or paid overages.
- **Secrets:** runtime Render environment only; separate hosted admin/CCI passwords. Never
  put secrets in `VITE_*`, Docker build arguments, logs, PR descriptions, or chat.
- **Runbook:** `docs/free-demo-deployment.md` (account creation and hosted checks pending).

Before handing off a deployment change, run:

```bash
(cd scan-api && mvn verify)
(cd scan-app && npm test && npm run lint && npm run build)
docker build --tag scan-demo:local .
bash scripts/smoke-container.sh scan-demo:local
```

The smoke script uses only disposable Docker test data, never the laptop database.
