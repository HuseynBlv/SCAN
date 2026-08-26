insert into retailer (id, code, name, zone_id, cci_sharing_enabled)
values (
    '00000000-0000-0000-0000-000000000003',
    'KAGGLE',
    'Kaggle Supermarket Dataset 2019',
    'Asia/Baku',
    true
);

insert into import_profile (
    id,
    retailer_id,
    code,
    source_system,
    delimiter,
    date_time_pattern,
    zone_id,
    currency,
    store_id_column,
    receipt_id_column,
    timestamp_column,
    product_code_column,
    barcode_column,
    product_name_column,
    quantity_column,
    unit_price_column,
    discount_amount_column,
    line_total_column
)
values (
    '00000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000003',
    'KAGGLE_2019',
    'kaggle-supermarket-2019',
    ',',
    'yyyy-MM-dd''T''HH:mm:ss',
    'Asia/Baku',
    'AZN',
    'store_id',
    'receipt_id',
    'transaction_timestamp',
    'product_code',
    'barcode',
    'product_name',
    'quantity',
    'unit_price',
    'discount_amount',
    'line_total'
);
