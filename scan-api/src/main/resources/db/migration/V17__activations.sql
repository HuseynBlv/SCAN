-- Scoped to one product per activation, with exactly two real, computable numbers (basket
-- penetration and revenue, both already produced by IntelligenceQueryRepository) rather than a
-- generic multi-metric framework nothing yet needs. No separate activation_metric table: there is
-- nothing to put in it that isn't already derivable from activation + activation_store.
create table activation (
    id uuid primary key,
    retailer_id uuid not null references retailer(id),
    name varchar(256) not null,
    objective varchar(512) not null,
    hypothesis varchar(512) not null,
    product_name varchar(256) not null,
    primary_metric varchar(32) not null,
    start_date date not null,
    end_date date not null,
    created_by varchar(128) not null,
    created_at timestamp with time zone not null default current_timestamp,
    updated_at timestamp with time zone not null default current_timestamp
);

create index activation_retailer_idx on activation (retailer_id);

create table activation_store (
    id uuid primary key,
    activation_id uuid not null references activation(id) on delete cascade,
    external_store_id varchar(128) not null,
    store_group varchar(16) not null,
    constraint activation_store_unique unique (activation_id, external_store_id)
);

create index activation_store_activation_idx on activation_store (activation_id);
