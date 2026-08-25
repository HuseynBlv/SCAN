-- Synthetic catalog used only by the DEMO retailer walkthrough and test fixture.
-- Real retailer products must be mapped to a reviewed canonical catalog explicitly.
insert into canonical_product (
    id,
    normalized_name,
    barcode,
    brand,
    manufacturer,
    category,
    is_cci
)
values
    (
        '00000000-0000-0000-0000-000000000101',
        'Coca-Cola 500ml',
        '5449000000996',
        'Coca-Cola',
        'CCI',
        'Beverages',
        true
    ),
    (
        '00000000-0000-0000-0000-000000000102',
        'Fanta 500ml',
        '5449000126241',
        'Fanta',
        'CCI',
        'Beverages',
        true
    ),
    (
        '00000000-0000-0000-0000-000000000103',
        'Chips 45g',
        '5053990109332',
        'Synthetic',
        'Synthetic',
        'Snacks',
        false
    ),
    (
        '00000000-0000-0000-0000-000000000104',
        'Bread',
        '2000000001008',
        'Synthetic',
        'Synthetic',
        'Bakery',
        false
    );
