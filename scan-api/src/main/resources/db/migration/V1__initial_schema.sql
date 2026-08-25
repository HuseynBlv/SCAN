create table retailer (
    id uuid primary key,
    code varchar(64) not null unique,
    name varchar(255) not null,
    zone_id varchar(64) not null default 'Asia/Baku',
    cci_sharing_enabled boolean not null default false,
    created_at timestamp with time zone not null default current_timestamp
);

create table store (
    id uuid primary key,
    retailer_id uuid not null references retailer(id),
    external_store_id varchar(128) not null,
    name varchar(255) not null,
    created_at timestamp with time zone not null default current_timestamp,
    constraint store_retailer_external_key unique (retailer_id, external_store_id)
);

create table import_profile (
    id uuid primary key,
    retailer_id uuid not null references retailer(id),
    code varchar(64) not null,
    source_system varchar(128) not null,
    delimiter varchar(1) not null default ',',
    date_time_pattern varchar(128) not null,
    zone_id varchar(64) not null,
    currency varchar(3) not null,
    store_id_column varchar(128) not null,
    receipt_id_column varchar(128) not null,
    timestamp_column varchar(128) not null,
    product_code_column varchar(128),
    barcode_column varchar(128),
    product_name_column varchar(128) not null,
    quantity_column varchar(128) not null,
    unit_price_column varchar(128) not null,
    discount_amount_column varchar(128) not null,
    line_total_column varchar(128) not null,
    created_at timestamp with time zone not null default current_timestamp,
    constraint import_profile_retailer_code_key unique (retailer_id, code)
);

create table import_job (
    id uuid primary key,
    retailer_id uuid not null references retailer(id),
    import_profile_id uuid not null references import_profile(id),
    original_filename varchar(512) not null,
    file_sha256 varchar(64) not null,
    status varchar(32) not null,
    total_rows integer not null default 0,
    imported_receipts integer not null default 0,
    imported_lines integer not null default 0,
    duplicate_receipts integer not null default 0,
    unresolved_products integer not null default 0,
    error_summary text,
    created_at timestamp with time zone not null default current_timestamp,
    completed_at timestamp with time zone,
    constraint import_job_retailer_hash_key unique (retailer_id, file_sha256)
);

create table canonical_product (
    id uuid primary key,
    normalized_name varchar(255) not null,
    barcode varchar(64) unique,
    brand varchar(255),
    manufacturer varchar(255),
    category varchar(128),
    subcategory varchar(128),
    package_size varchar(64),
    package_type varchar(64),
    is_cci boolean not null default false,
    created_at timestamp with time zone not null default current_timestamp
);

create table retailer_product (
    id uuid primary key,
    retailer_id uuid not null references retailer(id),
    product_key varchar(512) not null,
    source_product_code varchar(128),
    barcode varchar(64),
    original_product_name varchar(512) not null,
    canonical_product_id uuid references canonical_product(id),
    match_method varchar(32) not null default 'UNRESOLVED',
    created_at timestamp with time zone not null default current_timestamp,
    updated_at timestamp with time zone not null default current_timestamp,
    constraint retailer_product_key unique (retailer_id, product_key)
);

create index retailer_product_barcode_idx on retailer_product (retailer_id, barcode);
create index retailer_product_mapping_idx on retailer_product (retailer_id, canonical_product_id);

create table receipt (
    id uuid primary key,
    retailer_id uuid not null references retailer(id),
    store_id uuid not null references store(id),
    external_receipt_id varchar(256) not null,
    transaction_timestamp timestamp with time zone not null,
    currency varchar(3) not null,
    basket_value numeric(19, 4) not null,
    basket_fingerprint varchar(64) not null,
    source_import_job_id uuid not null references import_job(id),
    created_at timestamp with time zone not null default current_timestamp,
    constraint receipt_identity_key unique (
        retailer_id,
        store_id,
        external_receipt_id,
        transaction_timestamp
    )
);

create index receipt_retailer_timestamp_idx on receipt (retailer_id, transaction_timestamp desc);
create index receipt_store_timestamp_idx on receipt (store_id, transaction_timestamp desc);

create table transaction_line (
    id uuid primary key,
    receipt_id uuid not null references receipt(id) on delete cascade,
    retailer_product_id uuid not null references retailer_product(id),
    source_import_job_id uuid not null references import_job(id),
    source_row_number integer not null,
    product_code varchar(128),
    barcode varchar(64),
    original_product_name varchar(512) not null,
    quantity numeric(19, 4) not null,
    unit_price numeric(19, 4) not null,
    discount_amount numeric(19, 4) not null,
    line_total numeric(19, 4) not null,
    source_system varchar(128) not null,
    constraint transaction_line_quantity_positive check (quantity > 0),
    constraint transaction_line_discount_nonnegative check (discount_amount >= 0)
);

create index transaction_line_receipt_idx on transaction_line (receipt_id);
create index transaction_line_product_idx on transaction_line (retailer_product_id);

insert into retailer (id, code, name, zone_id, cci_sharing_enabled)
values ('00000000-0000-0000-0000-000000000001', 'DEMO', 'Synthetic Phase 0 Retailer', 'Asia/Baku', true);

insert into import_profile (
    id,
    retailer_id,
    code,
    source_system,
    delimiter,
    date_time_pattern,
    zone_id,
    currency,
    store_id_column,
    receipt_id_column,
    timestamp_column,
    product_code_column,
    barcode_column,
    product_name_column,
    quantity_column,
    unit_price_column,
    discount_amount_column,
    line_total_column
)
values (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'CANONICAL',
    'synthetic-canonical-v1',
    ',',
    'yyyy-MM-dd''T''HH:mm:ss',
    'Asia/Baku',
    'AZN',
    'store_id',
    'receipt_id',
    'transaction_timestamp',
    'product_code',
    'barcode',
    'product_name',
    'quantity',
    'unit_price',
    'discount_amount',
    'line_total'
);
