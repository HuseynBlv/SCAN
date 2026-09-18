create table import_preview (
    id uuid primary key,
    retailer_id uuid not null references retailer(id),
    import_profile_id uuid not null references import_profile(id),
    original_filename varchar(512) not null,
    file_sha256 varchar(64) not null,
    adapter_code varchar(64) not null,
    source_rows integer not null,
    receipts_detected integer not null,
    product_lines integer not null,
    distinct_products integer not null,
    quantity_total numeric(19, 4) not null,
    gross_sales numeric(19, 4) not null,
    discount_total numeric(19, 4) not null,
    reported_net_sales numeric(19, 4) not null,
    calculated_net_sales numeric(19, 4) not null,
    reconciliation_difference numeric(19, 4) not null,
    created_at timestamp with time zone not null default current_timestamp,
    expires_at timestamp with time zone not null,
    consumed_at timestamp with time zone
);

create index import_preview_scope_idx
    on import_preview (retailer_id, import_profile_id, created_at desc);

create index import_preview_expiry_idx on import_preview (expires_at);
