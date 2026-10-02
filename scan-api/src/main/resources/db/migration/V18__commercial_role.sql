-- A self-service UI preference, not an access-control boundary: any CCI account can set this on
-- itself to reorder what My Work shows first. It changes presentation only - tenant/retailer
-- access stays governed entirely by scan_account_retailer_access and TenantAccessService.
alter table scan_account add column commercial_role varchar(32) not null default 'COMMERCIAL';
