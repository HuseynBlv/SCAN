import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";

const LOCAL_STORAGE_KEY = "scan:baskets";
const LOCAL_STORE_KEY = "scan:stores";
const LOCAL_PRODUCT_KEY = "scan:products";

const DEMO_STORE = {
  name: "Store #47 — Narimanov",
  district: "Narimanov",
};

function nowIsoString() {
  return new Date().toISOString();
}

function createLocalId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readLocalJson(key, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocalJson(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function inferCategory(productName) {
  const normalized = `${productName || ""}`.toLowerCase();

  if (
    normalized.includes("coca-cola") ||
    normalized.includes("fanta") ||
    normalized.includes("sprite") ||
    normalized.includes("energy")
  ) {
    return "Beverages";
  }

  if (normalized.includes("lays") || normalized.includes("chips")) {
    return "Snacks";
  }

  if (normalized.includes("tea") || normalized.includes("azerchay")) {
    return "Tea";
  }

  if (normalized.includes("bread") || normalized.includes("sandwich")) {
    return "Bakery";
  }

  return "General";
}

function isCciProduct(productName, brand) {
  const normalized = `${productName} ${brand}`.toLowerCase();

  return (
    normalized.includes("coca-cola") ||
    normalized.includes("fanta") ||
    normalized.includes("sprite")
  );
}

function buildProductPayload(item) {
  const productName = item.isUnknown
    ? item.customName.trim() || item.name
    : item.name;
  const category = inferCategory(productName);
  const cciProduct = isCciProduct(productName, item.brand);

  return {
    barcode: item.barcode || null,
    name: productName,
    brand: item.brand || "Brand unavailable",
    category,
    is_cci_product: cciProduct,
    quantity: 1,
  };
}

function buildPersistedBasketRecord(basketRow, items, storeRow) {
  return {
    id: basketRow.id,
    store_id: storeRow.id,
    store_name: storeRow.name,
    district: basketRow.district || storeRow.district,
    created_at: basketRow.created_at,
    total_items: basketRow.total_items,
    contains_cci: basketRow.contains_cci,
    quality_score: basketRow.quality_score,
    points_awarded: basketRow.points_awarded,
    items,
  };
}

async function ensureSupabaseStore() {
  const { data: existing, error: selectError } = await supabase
    .from("stores")
    .select("id, name, district")
    .eq("name", DEMO_STORE.name)
    .eq("district", DEMO_STORE.district)
    .maybeSingle();

  if (selectError) {
    throw selectError;
  }

  if (existing) {
    return existing;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("stores")
    .insert({
      name: DEMO_STORE.name,
      district: DEMO_STORE.district,
    })
    .select("id, name, district")
    .single();

  if (insertError) {
    throw insertError;
  }

  return inserted;
}

async function ensureSupabaseProduct(productPayload) {
  if (productPayload.barcode) {
    const { data: existing, error: selectError } = await supabase
      .from("products")
      .select("id, barcode, name, brand, category, is_cci_product")
      .eq("barcode", productPayload.barcode)
      .maybeSingle();

    if (selectError) {
      throw selectError;
    }

    if (existing) {
      return existing;
    }
  }

  const { data: inserted, error: insertError } = await supabase
    .from("products")
    .insert({
      barcode: productPayload.barcode,
      name: productPayload.name,
      brand: productPayload.brand,
      category: productPayload.category,
      is_cci_product: productPayload.is_cci_product,
    })
    .select("id, barcode, name, brand, category, is_cci_product")
    .single();

  if (insertError) {
    throw insertError;
  }

  return inserted;
}

async function loadSupabaseBaskets() {
  const { data: baskets, error: basketError } = await supabase
    .from("baskets")
    .select("id, store_id, district, created_at, total_items, contains_cci, quality_score, points_awarded")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (basketError) {
    throw basketError;
  }

  if (!baskets?.length) {
    return [];
  }

  const basketIds = baskets.map((basket) => basket.id);
  const storeIds = [...new Set(baskets.map((basket) => basket.store_id).filter(Boolean))];

  const [{ data: items, error: itemError }, { data: stores, error: storeError }] =
    await Promise.all([
      supabase
        .from("basket_items")
        .select("id, basket_id, product_id, product_name, category, is_cci_product, quantity")
        .in("basket_id", basketIds),
      storeIds.length
        ? supabase.from("stores").select("id, name, district").in("id", storeIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

  if (itemError) {
    throw itemError;
  }

  if (storeError) {
    throw storeError;
  }

  const storeMap = new Map((stores || []).map((store) => [store.id, store]));
  const itemsByBasketId = new Map();

  (items || []).forEach((item) => {
    const currentItems = itemsByBasketId.get(item.basket_id) || [];
    currentItems.push(item);
    itemsByBasketId.set(item.basket_id, currentItems);
  });

  return baskets.map((basket) => {
    const store = storeMap.get(basket.store_id) || DEMO_STORE;

    return buildPersistedBasketRecord(
      basket,
      itemsByBasketId.get(basket.id) || [],
      { id: basket.store_id, name: store.name, district: store.district }
    );
  });
}

function ensureLocalStore() {
  const stores = readLocalJson(LOCAL_STORE_KEY, []);
  const existingStore = stores.find(
    (store) => store.name === DEMO_STORE.name && store.district === DEMO_STORE.district
  );

  if (existingStore) {
    return existingStore;
  }

  const store = {
    id: createLocalId("store"),
    name: DEMO_STORE.name,
    district: DEMO_STORE.district,
    created_at: nowIsoString(),
  };

  writeLocalJson(LOCAL_STORE_KEY, [...stores, store]);
  return store;
}

function ensureLocalProduct(productPayload) {
  const products = readLocalJson(LOCAL_PRODUCT_KEY, []);
  const existing = productPayload.barcode
    ? products.find((product) => product.barcode === productPayload.barcode)
    : null;

  if (existing) {
    return existing;
  }

  const product = {
    id: createLocalId("product"),
    barcode: productPayload.barcode,
    name: productPayload.name,
    brand: productPayload.brand,
    category: productPayload.category,
    is_cci_product: productPayload.is_cci_product,
    created_at: nowIsoString(),
  };

  writeLocalJson(LOCAL_PRODUCT_KEY, [...products, product]);
  return product;
}

function loadLocalBaskets() {
  return readLocalJson(LOCAL_STORAGE_KEY, []);
}

function saveLocalBasket(scannedItems) {
  const store = ensureLocalStore();
  const productItems = scannedItems.map(buildProductPayload);
  const resolvedProducts = productItems.map(ensureLocalProduct);
  const createdAt = nowIsoString();
  const basket = {
    id: createLocalId("basket"),
    store_id: store.id,
    store_name: store.name,
    district: store.district,
    created_at: createdAt,
    total_items: productItems.length,
    contains_cci: productItems.some((item) => item.is_cci_product),
    quality_score: Math.min(100, 55 + productItems.length * 8),
    points_awarded: productItems.length * 4,
    items: productItems.map((item, index) => ({
      id: createLocalId("basket-item"),
      basket_id: null,
      product_id: resolvedProducts[index].id,
      product_name: item.name,
      category: item.category,
      is_cci_product: item.is_cci_product,
      quantity: item.quantity,
    })),
  };

  const baskets = loadLocalBaskets();
  writeLocalJson(LOCAL_STORAGE_KEY, [basket, ...baskets]);

  return basket;
}

async function saveSupabaseBasket(scannedItems) {
  const store = await ensureSupabaseStore();
  const productPayloads = scannedItems.map(buildProductPayload);
  const resolvedProducts = [];

  for (const productPayload of productPayloads) {
    // Sequential inserts keep the implementation simpler and reliable for demo use.
    resolvedProducts.push(await ensureSupabaseProduct(productPayload));
  }

  const containsCci = productPayloads.some((item) => item.is_cci_product);
  const basketInsert = {
    store_id: store.id,
    district: store.district,
    total_items: productPayloads.length,
    contains_cci: containsCci,
    quality_score: Math.min(100, 55 + productPayloads.length * 8),
    points_awarded: productPayloads.length * 4,
  };

  const { data: basketRow, error: basketError } = await supabase
    .from("baskets")
    .insert(basketInsert)
    .select("id, store_id, district, created_at, total_items, contains_cci, quality_score, points_awarded")
    .single();

  if (basketError) {
    throw basketError;
  }

  const basketItems = productPayloads.map((item, index) => ({
    basket_id: basketRow.id,
    product_id: resolvedProducts[index].id,
    product_name: item.name,
    category: item.category,
    is_cci_product: item.is_cci_product,
    quantity: item.quantity,
  }));

  const { error: itemError } = await supabase.from("basket_items").insert(basketItems);

  if (itemError) {
    throw itemError;
  }

  return buildPersistedBasketRecord(
    basketRow,
    basketItems.map((item, index) => ({
      id: createLocalId("basket-item"),
      ...item,
      product_id: resolvedProducts[index].id,
    })),
    store
  );
}

export function getBasketDataMode() {
  return isSupabaseConfigured ? "supabase" : "local";
}

export async function fetchPersistedBaskets() {
  if (!isSupabaseConfigured) {
    return loadLocalBaskets();
  }

  return loadSupabaseBaskets();
}

export async function persistBasket(scannedItems) {
  if (!isSupabaseConfigured) {
    return saveLocalBasket(scannedItems);
  }

  return saveSupabaseBasket(scannedItems);
}

export function subscribeToBasketChanges(onChange, onError) {
  if (!isSupabaseConfigured || !supabase) {
    return () => {};
  }

  const channel = supabase
    .channel("scan-baskets-live")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "baskets" },
      onChange
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "basket_items" },
      onChange
    )
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" && onError) {
        onError(new Error("Realtime subscription failed."));
      }
    });

  return () => {
    supabase.removeChannel(channel);
  };
}
