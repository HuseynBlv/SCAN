-- Retailer-approved aggregate sharing for the controlled CASPOS pilot.
-- The CCI API remains read-only and does not expose cashier or payment fields.
update retailer
set cci_sharing_enabled = true
where code = 'CASPOS_PILOT';
