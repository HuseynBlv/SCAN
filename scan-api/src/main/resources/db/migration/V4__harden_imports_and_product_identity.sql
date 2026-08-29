alter table import_job
    drop constraint import_job_retailer_hash_key;

alter table import_job
    add column attempt_number integer not null default 1;

alter table import_job
    add constraint import_job_retailer_hash_attempt_key
        unique (retailer_id, file_sha256, attempt_number);

alter table import_job
    add constraint import_job_attempt_number_positive check (attempt_number > 0);

alter table canonical_product
    add column normalized_key varchar(255);

update canonical_product
set normalized_key = upper(trim(normalized_name));

alter table canonical_product
    alter column normalized_key set not null;

alter table canonical_product
    add constraint canonical_product_normalized_key_key unique (normalized_key);

alter table transaction_line
    add constraint transaction_line_unit_price_nonnegative check (unit_price >= 0);

alter table transaction_line
    add constraint transaction_line_line_total_nonnegative check (line_total >= 0);
