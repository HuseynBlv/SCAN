alter table retailer
    add column transaction_import_enabled boolean not null default true;

-- The public Kaggle tenant is an immutable demonstration dataset. Real uploads
-- must always use a separately provisioned retailer tenant.
update retailer
set transaction_import_enabled = false
where code = 'KAGGLE';

alter table import_profile
    add constraint import_profile_id_retailer_key unique (id, retailer_id);

create table scan_account (
    id uuid primary key,
    username varchar(128) not null unique,
    password_hash varchar(255) not null,
    account_role varchar(32) not null,
    retailer_id uuid references retailer(id),
    import_profile_id uuid,
    enabled boolean not null default true,
    created_at timestamp with time zone not null default current_timestamp,
    updated_at timestamp with time zone not null default current_timestamp,
    constraint scan_account_username_normalized check (username = lower(trim(username))),
    constraint scan_account_role_check check (
        (account_role = 'CCI' and retailer_id is null and import_profile_id is null)
        or (account_role = 'RETAILER' and retailer_id is not null and import_profile_id is null)
        or (account_role in ('ADMIN', 'INGEST') and retailer_id is not null and import_profile_id is not null)
    ),
    constraint scan_account_profile_retailer_fk
        foreign key (import_profile_id, retailer_id)
        references import_profile(id, retailer_id)
);

create index scan_account_retailer_idx on scan_account (retailer_id);

create table scan_account_retailer_access (
    account_id uuid not null references scan_account(id) on delete cascade,
    retailer_id uuid not null references retailer(id) on delete cascade,
    created_at timestamp with time zone not null default current_timestamp,
    primary key (account_id, retailer_id)
);

create index scan_account_retailer_access_retailer_idx
    on scan_account_retailer_access (retailer_id);
