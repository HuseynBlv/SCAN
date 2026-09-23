-- A canonical product created by catalog import or an external barcode lookup had no way to be
-- corrected afterward - not by an admin, not by anyone. A crowd-sourced lookup can return a name
-- in whatever language the original contributor used, and that had no fix short of raw SQL.
alter table canonical_product
    add column updated_at timestamp with time zone not null default current_timestamp;
