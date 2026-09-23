-- Captures a source file's own category text (e.g. CloudSale's Kateqoriya column) alongside a
-- product, so companion-category analysis has something real to fall back to before a product is
-- manually mapped to the canonical catalog - mirroring how original_product_name already does for
-- companion-product analysis.
alter table retailer_product
    add column original_category varchar(128);
