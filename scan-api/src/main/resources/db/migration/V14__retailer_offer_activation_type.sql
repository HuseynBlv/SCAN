-- Offers now come in different trade-marketing mechanics (volume discount, bonus product,
-- weekend activation, basket-growth opportunity), not one templated structure. An activated
-- offer needs to remember which mechanic it was so its card renders consistently after
-- activation, without re-deriving it from analytics that may have moved on since.
alter table retailer_offer_activation
    add column offer_type varchar(32) not null default 'VOLUME_DISCOUNT';

alter table retailer_offer_activation
    alter column offer_type drop default;
