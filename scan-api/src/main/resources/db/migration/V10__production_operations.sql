alter table scan_account
    add column revoked_at timestamp with time zone;

alter table scan_account
    add column last_rotated_at timestamp with time zone;

alter table import_job
    add column submitted_by varchar(128) not null default 'system';

alter table import_job
    add column started_at timestamp with time zone;

alter table import_job
    add column updated_at timestamp with time zone not null default current_timestamp;

create index import_job_retailer_created_idx
    on import_job (retailer_id, created_at desc);

create index import_job_queue_idx
    on import_job (status, created_at);

create table import_payload (
    import_job_id uuid primary key references import_job(id) on delete cascade,
    file_bytes bytea not null,
    created_at timestamp with time zone not null default current_timestamp
);

create table operational_audit_event (
    id uuid primary key,
    retailer_id uuid references retailer(id),
    actor_account_id uuid references scan_account(id),
    actor_username varchar(128) not null,
    event_type varchar(64) not null,
    subject_type varchar(64) not null,
    subject_id varchar(128),
    detail varchar(2000),
    occurred_at timestamp with time zone not null default current_timestamp
);

create index operational_audit_retailer_time_idx
    on operational_audit_event (retailer_id, occurred_at desc);

create index operational_audit_actor_time_idx
    on operational_audit_event (actor_account_id, occurred_at desc);

create table scan_runtime_environment (
    singleton_id smallint primary key,
    environment_name varchar(32) not null,
    database_id varchar(128) not null,
    claimed_at timestamp with time zone not null default current_timestamp,
    constraint scan_runtime_environment_singleton check (singleton_id = 1),
    constraint scan_runtime_environment_name_check
        check (environment_name in ('development', 'test', 'demo', 'production'))
);
