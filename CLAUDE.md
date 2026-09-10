# SCAN project context

Read `README.md` for the retailer-export pivot, supported features, and pilot limitations.
Preserve the legacy scanner; it is not the current ingestion path. Numerical analytics must
remain deterministic. Do not commit credentials, raw exports, or generated datasets.

## Deploy Configuration (configured by /setup-deploy)

- **Platform:** Render Free Docker web services, with external Neon Free PostgreSQL. `scan-demo`
  remains the bounded synthetic demo; `scan-caspos-pilot` is the separate CASPOS pilot application
  identity. Both services use the same Neon database.
- **Production URLs:** `https://scan-demo.onrender.com` for the synthetic demo and
  `https://scan-caspos-pilot.onrender.com` for the CASPOS pilot. Both services follow `main`;
  commit `08c9e82` is the current verified hosted demo baseline.
  Public health, frontend delivery, authentication boundaries, Neon startup, the
  10,000-basket hosted import, duplicate-file behavior, authenticated retailer/CCI analytics,
  and responsive dashboard QA are verified.
- **Project type:** React web app and Spring Boot API served from one HTTPS origin.
- **Configuration:** root `Dockerfile`, `render.yaml`, and the Spring `cloud` profile.
- **Deploy trigger:** manual from Render after GitHub CI passes; service auto-deploy is off.
  Review Blueprint syncs too, because configuration changes can trigger deployment.
- **Production branch:** `main` in `render.yaml` and both Render services.
- **Health check:** `GET /health` returns only `{"status":"UP"}`. This is liveness, not
  database readiness; verify authenticated analytics separately.
- **Merge policy:** reviewed PR and green CI before a manual Render deployment. Do not merge
  or deploy automatically.
- **Budget:** $0. No paid services, disks, upgrades, payment methods, or paid overages.
- **Secrets:** runtime Render environment only; separate hosted admin, CCI, connector, and
  retailer passwords. Never
  put secrets in `VITE_*`, Docker build arguments, logs, PR descriptions, or chat.
- **Runbook:** `docs/free-demo-deployment.md` (deployment, hosted import, and post-import
  checks complete for the bounded technical demo).

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

## Design System

Always read `DESIGN.md` before making any visual or UI decisions.
All font choices, colors, spacing, layout, component behavior, data-visualization rules, and
the approved Variant A direction are defined there. Do not deviate without explicit user
approval. In QA mode, flag visual code that does not match `DESIGN.md`.
