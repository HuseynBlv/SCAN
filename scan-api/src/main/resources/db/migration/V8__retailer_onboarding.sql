alter table retailer
    alter column transaction_import_enabled set default false;

alter table import_profile
    add column display_name varchar(128);

alter table import_profile
    add column validation_status varchar(32) not null default 'DRAFT';

alter table import_profile
    add column validated_at timestamp with time zone;

update import_profile
set display_name = case
    when code = 'CANONICAL' then 'Standard transaction export'
    when code = 'KAGGLE_2019' then 'Kaggle demo format'
    when code = 'CLOUDSALE_V1' then 'CloudSale transaction export'
    else source_system
end,
validation_status = 'VALIDATED',
validated_at = current_timestamp;

alter table import_profile
    alter column display_name set not null;

alter table import_profile
    add constraint import_profile_validation_status_check
        check (validation_status in ('DRAFT', 'VALIDATED'));

alter table scan_account
    drop constraint scan_account_role_check;

alter table scan_account
    add constraint scan_account_role_check check (
        (account_role in ('CCI', 'ONBOARDING') and retailer_id is null and import_profile_id is null)
        or (account_role = 'RETAILER' and retailer_id is not null and import_profile_id is null)
        or (account_role in ('ADMIN', 'INGEST') and retailer_id is not null and import_profile_id is not null)
    );
