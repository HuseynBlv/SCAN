create table retailer_opportunity_trial (
    id uuid primary key,
    retailer_id uuid not null references retailer(id) on delete cascade,
    opportunity_key varchar(96) not null,
    opportunity_type varchar(48) not null,
    title varchar(256) not null,
    store_id varchar(128) not null,
    product_a varchar(256),
    product_b varchar(256),
    action_title varchar(128) not null,
    start_date date not null,
    end_date date not null,
    baseline_start date not null,
    baseline_end date not null,
    baseline_metric varchar(64) not null,
    baseline_value numeric(19, 4) not null,
    baseline_numerator bigint not null,
    baseline_denominator bigint not null,
    created_by varchar(128) not null,
    created_at timestamp with time zone not null default current_timestamp,
    constraint retailer_opportunity_trial_dates check (end_date >= start_date),
    constraint retailer_opportunity_trial_baseline_dates check (baseline_end >= baseline_start),
    constraint retailer_opportunity_trial_key unique (retailer_id, opportunity_key)
);

create index retailer_opportunity_trial_retailer_idx
    on retailer_opportunity_trial (retailer_id, start_date desc);
