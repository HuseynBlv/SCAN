# SCAN project context

Read `README.md` for the retailer-export pivot, supported features, and pilot limitations.
Preserve the legacy scanner; it is not the current ingestion path. Numerical analytics must
remain deterministic. Do not commit credentials, raw exports, or generated datasets.

## Deploy Configuration (configured by /setup-deploy)

- **Platform:** one Render Free Docker web service, with external Neon Free PostgreSQL.
- **Production URL:** `https://scan-demo.onrender.com`. Render reported commit `eaf1f30` live
  on 2026-08-28; public health, frontend delivery, unauthenticated 401, and Neon startup were
  verified. Authenticated analytics and hosted demo-data import remain pending.
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
- **Runbook:** `docs/free-demo-deployment.md` (initial deployment complete; authenticated
  analytics, demo import, and post-import checks pending).

Before handing off a deployment change, run:

```bash
(cd scan-api && mvn verify)
(cd scan-app && npm test && npm run lint && npm run build)
docker build --tag scan-demo:local .
bash scripts/smoke-container.sh scan-demo:local
```

The smoke script uses only disposable Docker test data, never the laptop database.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec
