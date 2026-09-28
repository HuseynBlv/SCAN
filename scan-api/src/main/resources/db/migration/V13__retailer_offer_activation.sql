-- The retailer-side product pivot turns SCAN from an analytics dashboard into an actions-and-
-- benefits surface: CCI-product commercial offers are computed live from a retailer's own recorded
-- sales, but once a retailer activates one, that acceptance is real, persisted state - not
-- something that can silently change if the underlying sales data shifts on a later refresh.
-- expires_at is captured at activation time (not recomputed later) so a completed offer stays
-- completed even if the surrounding analytics window moves.
create table retailer_offer_activation (
    id uuid primary key,
    retailer_id uuid not null references retailer(id),
    offer_key varchar(160) not null,
    title varchar(256) not null,
    product_name varchar(256) not null,
    category varchar(128),
    benefit_summary varchar(256) not null,
    normal_condition varchar(128) not null,
    partner_condition varchar(128) not null,
    estimated_benefit_azn numeric(10, 2),
    activated_at timestamp with time zone not null default current_timestamp,
    expires_at timestamp with time zone not null,
    constraint retailer_offer_activation_unique unique (retailer_id, offer_key)
);

create index retailer_offer_activation_retailer_idx on retailer_offer_activation (retailer_id);
