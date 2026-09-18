# SCAN production operations

## Environment isolation

Demo and production must use different PostgreSQL databases and different credentials. Set:

| Deployment | `SCAN_RUNTIME_ENVIRONMENT` | `SCAN_DATABASE_ID` | Database |
|---|---|---|---|
| Demo | `demo` | `scan-demo` | Demo-only database |
| Production | `production` | `scan-production` | Retailer production database |

The API writes the environment identity to `scan_runtime_environment` on first start. A later
start with a different environment or database ID fails before serving traffic. Production also
refuses an H2/in-memory database. Never copy production retailer data into the demo database.

## Imports and monitoring

Uploads are saved as durable `RECEIVED` jobs with their short-lived payload, then processed by the
database-backed worker. The worker locks one queued job, validates it again, persists the complete
transaction atomically, and removes the payload after success or failure. Jobs stuck for 30 minutes
are requeued after a process restart.

Use the Data Connection **Import history** screen or:

```bash
curl -u "$SCAN_ADMIN_USERNAME:$SCAN_ADMIN_PASSWORD" \
  "$SCAN_BASE_URL/api/v1/imports/operations"
curl -u "$SCAN_ADMIN_USERNAME:$SCAN_ADMIN_PASSWORD" \
  "$SCAN_BASE_URL/api/v1/imports/history?limit=50"
curl -u "$SCAN_ADMIN_USERNAME:$SCAN_ADMIN_PASSWORD" \
  "$SCAN_BASE_URL/api/v1/imports/audit?limit=50"
```

Run `scripts/check-production.sh` from an external scheduler. Alert on HTTP failure, queued jobs
older than the agreed import window, or failed jobs from the previous 24 hours. Full failure history
remains available in the retailer's import history after the alert window closes.

## Credential operations

The onboarding portal lists retailer-bound accounts. Rotation returns a new password once and
invalidates the old password immediately. Revocation disables the account immediately. Both actions
create immutable audit events. Never send passwords through the audit detail field or application
logs.

## Backup

Use a database-provider scheduled backup/PITR feature where available, plus a periodic encrypted
logical backup stored outside the application host:

```bash
export SCAN_DATABASE_URL='postgresql://...'
export SCAN_BACKUP_DIR='/protected/scan-backups'
./scripts/backup-postgres.sh
```

Encrypt and copy the resulting `.dump` and `.sha256` files to access-controlled object storage.
Keep at least one copy in a different failure domain. Do not store backups in this repository.

## Recovery drill

Restore into a newly created, empty database. Never run the restore script against the active
production database.

```bash
export SCAN_RESTORE_DATABASE_URL='postgresql://.../scan_recovery'
export SCAN_RESTORE_FILE='/protected/scan-backups/scan-YYYYMMDDTHHMMSSZ.dump'
export SCAN_RESTORE_CONFIRM='RESTORE_TO_EMPTY_DATABASE'
./scripts/restore-postgres.sh
```

Then start one isolated SCAN instance with a new `SCAN_DATABASE_ID`, verify Flyway, account access,
retailer counts, latest completed import, basket totals, and product mappings. Only after verification
should DNS/service configuration be switched. Record recovery time and the latest recovered import.
