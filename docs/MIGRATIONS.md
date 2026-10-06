# Database migrations

## Commands and lifecycle

`pnpm db:migrate` applies `server/migrations/NNN_name.sql` in version order. Migration files are immutable after application. Their normalized-LF SHA-256 checksums and names are recorded in `app_migrations`. Versions must be contiguous from 001; unknown versions, changed checksums or gaps stop the process.

Development database opening applies migrations automatically, preserving the prior local-start workflow. Production startup performs a read-only migration-history check and refuses pending/incompatible migrations. It never applies DDL automatically.

The migration runner locks the ledger in a transaction, executes pending SQL and records its checksum in that transaction. A failure rolls back the pending batch. Transaction-incompatible operations such as CREATE INDEX CONCURRENTLY must not be added to this runner; plan those separately. Migrations that exceed deployment lock/time budgets need a reviewed staged procedure.

## Existing local databases

001 contains the original idempotent schema, including the legacy `schema_versions` row. Existing users, sessions, matches, messages, photos, events and RSVPs are not deleted or reseeded by migration adoption.

Before adopting an existing version-1 database, the runner compares its baseline columns/defaults/nullability and table constraints with migration 001 in a temporary schema. Unknown versions, partial schemas or structural mismatches stop adoption. The temporary schema is transactionally created and removed; an error rolls it back. Extra unrelated tables are left alone. Existing indexes are not a full drift check; missing named baseline indexes are created by the initial SQL. Do not treat the history ledger as a complete ongoing database-drift detector.

Take a backup before deploying any migration. Never run two PGlite processes against the same directory: stop the local API before invoking the migration CLI against its data directory. The startup path uses the existing single connection and needs no separate process.

## Hosted deployment roles

M3 adds migration 003 with shared counters, staff MFA/step-up records, photo-gallery backfill, account-request intake records, draft/cancelled event metadata, RSVP cancellation timestamps, notification jobs and append-only audit triggers. Runtime table grants must be reviewed. The new app must not run against a schema missing 003. See SAFETY_OPERATIONS_M3.md for approval gates and credential separation.

M2 adds migration 002: onboarding draft/completion fields, versioned consent records, reset-token hashes and an encrypted recovery-mail queue. Existing real accounts are prompted to finish onboarding; no synthetic consent is backfilled. Runtime grants must include the new tables. See AUTH_NAVIGATION_M2.md for worker operation and policy gates.

Provision a dedicated database with a migration owner and a separate runtime role. The migration owner must own the application schema/objects and have the DDL privileges needed by reviewed migrations. Supply its connection string only to the deployment job via `MIGRATION_DATABASE_URL`; production migration jobs refuse to proceed without it. The API uses `DATABASE_URL` and must not inherit that owner credential.

After initial migration, grant the runtime role schema USAGE, required table SELECT/INSERT/UPDATE/DELETE privileges, SELECT on app_migrations, and sequence privileges where needed. Revoke runtime CREATE/ownership privileges and verify grants against actual endpoints. Prefer audit_log SELECT/INSERT only and no UPDATE/DELETE; the runtime does not mutate migration history. Configure default privileges as the migration owner for future tables, with explicit audit/history exceptions. Exact role names, passwords and managed-host capabilities are environment-specific; no users/grants have been created by this change.

Deployment sequence:

1. Back up and record the existing application version and migration history.
2. Run the migration job using the migration credential and the same TLS policy as the approved database.
3. Apply/review runtime grants for new objects.
4. Start the new API using only its runtime credential; startup checks the ledger.
5. Observe deployment health before promoting traffic.

## Recovery and rollback

Prefer expand/contract migrations compatible with the prior and next app versions. Do not automatically reverse SQL or delete migration ledger entries. If a migration transaction fails, fix the cause and rerun the unchanged unapplied migration. If an applied change needs reversal, write a new forward migration or restore the backed-up database into a separate instance and switch the compatible app and database together. Confirm acceptable data loss and downtime before a restore; restoring over live data is not an automatic deployment action.

The embedded adapter and PostgreSQL pool share the runner, but hosted execution, role grants, lock contention and restore procedures still require staging validation. No backup restore or hosted migration run is claimed by this milestone.
