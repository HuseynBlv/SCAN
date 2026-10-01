-- Scoped to products only for now: ChangeDetectionService can only compute a real recent-vs-prior
-- comparison for a product (compareProduct). A store/category/region/metric/activation watchlist
-- would need a comparison function that doesn't exist yet, so this table is not built to pretend
-- otherwise - it will grow (a type column, or a new table) once those comparisons are real.
create table watchlist_item (
    id uuid primary key,
    retailer_id uuid not null references retailer(id),
    product_name varchar(256) not null,
    added_by varchar(128) not null,
    created_at timestamp with time zone not null default current_timestamp,
    constraint watchlist_item_unique unique (retailer_id, product_name)
);

create index watchlist_item_retailer_idx on watchlist_item (retailer_id);
