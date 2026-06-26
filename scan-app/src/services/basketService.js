import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import { evaluateBasketReward } from "./rewards";

const LOCAL_STORAGE_KEY = "scan:baskets";
const LOCAL_STORE_KEY = "scan:stores";
const LOCAL_PRODUCT_KEY = "scan:products";
const PENDING_BASKETS_KEY = "scan:pending-baskets";
const ACTIVE_STORE_KEY = "scan:active-store";
const DEMO_OFFLINE_KEY = "scan:demo-offline";

export const DEMO_STORES = [
  {
    name: "Store #47 — Narimanov",
    district: "Narimanov",
  },
  {
    name: "Store #12 — Yasamal",
    district: "Yasamal",
  },
  {
    name: "Store #31 — Nizami",
    district: "Nizami",
  },
  {
    name: "Store #8 — Khatai",
    district: "Khatai",
  },
  {
    name: "Store #22 — Sabail",
    district: "Sabail",
  },
];

const DEFAULT_DEMO_STORE = DEMO_STORES[0];

const NETWORK_DEMO_STORES = [
  {
    name: "Store #153 — Narimanov",
    district: "Narimanov",
  },
  {
    name: "Store #112 — Yasamal",
    district: "Yasamal",
  },
  {
    name: "Store #131 — Nizami",
    district: "Nizami",
  },
  {
    name: "Store #108 — Khatai",
    district: "Khatai",
  },
  {
    name: "Store #122 — Sabail",
    district: "Sabail",
  },
];

const DEMO_PRODUCT_CATALOG = {
  coke: {
    barcode: "5449000000996",
    name: "Coca-Cola",
    brand: "The Coca-Cola Company",
    quantity: "500ml",
  },
  cokeZero: {
    barcode: "5449000096254",
    name: "Coca-Cola Zero",
    brand: "The Coca-Cola Company",
    quantity: "500ml",
  },
  fanta: {
    barcode: "5449000126241",
    name: "Fanta",
    brand: "The Coca-Cola Company",
    quantity: "500ml",
  },
  sprite: {
    barcode: "5449000131832",
    name: "Sprite",
    brand: "The Coca-Cola Company",
    quantity: "500ml",
  },
  fuseTea: {
    barcode: "5449000236031",
    name: "Fuse Tea",
    brand: "The Coca-Cola Company",
    quantity: "500ml",
  },
  bonaqua: {
    barcode: "5449000148267",
    name: "Bonaqua",
    brand: "The Coca-Cola Company",
    quantity: "500ml",
  },
  chips: {
    barcode: "5053990109332",
    name: "Chips",
    brand: "Lay's",
    quantity: "45g",
  },
  sandwich: {
    barcode: "2000000001114",
    name: "Sandwich",
    brand: "Fresh Corner",
    quantity: "1 pc",
  },
  chocolate: {
    barcode: "7622210449283",
    name: "Chocolate",
    brand: "Cadbury",
    quantity: "50g",
  },
  croissant: {
    barcode: "2000000002227",
    name: "Croissant",
    brand: "Bakery",
    quantity: "1 pc",
  },
  gum: {
    barcode: "7622300781583",
    name: "Gum",
    brand: "Orbit",
    quantity: "14g",
  },
  localSnack: {
    barcode: "2000000003330",
    name: "Local snack",
    brand: "Baku Bites",
    quantity: "35g",
  },
};

const DISTRICT_TO_STORE = new Map(
  NETWORK_DEMO_STORES.map((store) => [store.district, store])
);

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
    normalized.includes("fuse tea") ||
    normalized.includes("bonaqua") ||
    normalized.includes("water") ||
    normalized.includes("energy")
  ) {
    return "Beverages";
  }

  if (
    normalized.includes("lays") ||
    normalized.includes("chips") ||
    normalized.includes("chocolate") ||
    normalized.includes("gum") ||
    normalized.includes("snack")
  ) {
    return "Snacks";
  }

  if (normalized.includes("tea") || normalized.includes("azerchay")) {
    return "Tea";
  }

  if (
    normalized.includes("bread") ||
    normalized.includes("sandwich") ||
    normalized.includes("croissant") ||
    normalized.includes("bakery")
  ) {
    return "Bakery";
  }

  return "General";
}

function isCciProduct(productName, brand) {
  const normalized = `${productName} ${brand}`.toLowerCase();

  return (
    normalized.includes("coca-cola") ||
    normalized.includes("fanta") ||
    normalized.includes("sprite") ||
    normalized.includes("fuse tea") ||
    normalized.includes("bonaqua")
  );
}

function normalizeStore(storeInput = {}) {
  const fallback = getActiveDemoStore();

  return {
    name: storeInput.name || fallback.name,
    district: storeInput.district || fallback.district,
  };
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

function buildPersistedBasketRecord(basketRow, items, storeRow, overrides = {}) {
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
    sync_state: overrides.syncState || "synced",
  };
}

function loadLocalBaskets() {
  return readLocalJson(LOCAL_STORAGE_KEY, []);
}

function writeLocalBaskets(baskets) {
  writeLocalJson(LOCAL_STORAGE_KEY, baskets);
}

function loadPendingBaskets() {
  return readLocalJson(PENDING_BASKETS_KEY, []);
}

function writePendingBaskets(baskets) {
  writeLocalJson(PENDING_BASKETS_KEY, baskets);
}

function buildLocalBasketRecord(scannedItems, options = {}) {
  const store = normalizeStore(options.store);
  const existingBaskets = loadLocalBaskets();
  const recentBaskets = existingBaskets.filter((basket) => basket.store_name === store.name);
  const productItems = scannedItems.map(buildProductPayload);
  const createdAt = options.createdAt || nowIsoString();
  const rewardMeta = evaluateBasketReward(scannedItems, recentBaskets);

  return {
    id: options.id || createLocalId("basket"),
    store_id: options.storeId || createLocalId("store"),
    store_name: store.name,
    district: store.district,
    created_at: createdAt,
    total_items: productItems.length,
    contains_cci: productItems.some((item) => item.is_cci_product),
    quality_score: rewardMeta.qualityScore,
    points_awarded: rewardMeta.pointsAwarded,
    sync_state: options.syncState || "local",
    items: productItems.map((item, index) => ({
      id: createLocalId("basket-item"),
      basket_id: options.id || null,
      product_id: options.productIds?.[index] || createLocalId("product"),
      product_name: item.name,
      category: scannedItems[index]?.isUnknown ? "Manual Entry" : item.category,
      is_cci_product: item.is_cci_product,
      quantity: scannedItems[index]?.quantity || 1,
      is_manual: Boolean(scannedItems[index]?.isUnknown),
    })),
  };
}

function mergeBaskets(...collections) {
  const merged = new Map();

  collections.flat().forEach((basket) => {
    if (!basket?.id) {
      return;
    }

    merged.set(basket.id, basket);
  });

  return [...merged.values()].sort(
    (left, right) => new Date(right.created_at) - new Date(left.created_at)
  );
}

function ensureLocalStore(storeInput = {}) {
  const store = normalizeStore(storeInput);
  const stores = readLocalJson(LOCAL_STORE_KEY, []);
  const existingStore = stores.find(
    (entry) => entry.name === store.name && entry.district === store.district
  );

  if (existingStore) {
    return existingStore;
  }

  const createdStore = {
    id: createLocalId("store"),
    name: store.name,
    district: store.district,
    created_at: nowIsoString(),
  };

  writeLocalJson(LOCAL_STORE_KEY, [...stores, createdStore]);
  return createdStore;
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

function saveLocalBasket(scannedItems, options = {}) {
  const store = ensureLocalStore(options.store);
  const productItems = scannedItems.map(buildProductPayload);
  const resolvedProducts = productItems.map(ensureLocalProduct);
  const localBasket = buildLocalBasketRecord(scannedItems, {
    ...options,
    store,
    storeId: store.id,
    productIds: resolvedProducts.map((product) => product.id),
  });
  const baskets = loadLocalBaskets();

  writeLocalBaskets([localBasket, ...baskets]);

  if (options.syncState === "pending") {
    writePendingBaskets([localBasket, ...loadPendingBaskets()]);
  }

  return localBasket;
}

async function ensureSupabaseStore(storeInput = {}) {
  const store = normalizeStore(storeInput);
  const { data: existing, error: selectError } = await supabase
    .from("stores")
    .select("id, name, district")
    .eq("name", store.name)
    .eq("district", store.district)
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
      name: store.name,
      district: store.district,
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
    .select(
      "id, store_id, district, created_at, total_items, contains_cci, quality_score, points_awarded"
    )
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
        .select(
          "id, basket_id, product_id, product_name, category, is_cci_product, quantity"
        )
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
    const store = storeMap.get(basket.store_id) || DEFAULT_DEMO_STORE;

    return buildPersistedBasketRecord(
      basket,
      itemsByBasketId.get(basket.id) || [],
      { id: basket.store_id, name: store.name, district: store.district }
    );
  });
}

async function saveSupabaseBasket(scannedItems, options = {}) {
  const store = await ensureSupabaseStore(options.store);
  const recentBaskets = (await loadSupabaseBaskets()).filter(
    (basket) => basket.store_name === store.name
  );
  const productPayloads = scannedItems.map(buildProductPayload);
  const resolvedProducts = [];

  for (const productPayload of productPayloads) {
    resolvedProducts.push(await ensureSupabaseProduct(productPayload));
  }

  const containsCci = productPayloads.some((item) => item.is_cci_product);
  const rewardMeta = evaluateBasketReward(scannedItems, recentBaskets);
  const basketInsert = {
    store_id: store.id,
    district: store.district,
    created_at: options.createdAt || nowIsoString(),
    total_items: productPayloads.length,
    contains_cci: containsCci,
    quality_score: rewardMeta.qualityScore,
    points_awarded: rewardMeta.pointsAwarded,
  };

  const { data: basketRow, error: basketError } = await supabase
    .from("baskets")
    .insert(basketInsert)
    .select(
      "id, store_id, district, created_at, total_items, contains_cci, quality_score, points_awarded"
    )
    .single();

  if (basketError) {
    throw basketError;
  }

  const basketItems = productPayloads.map((item, index) => ({
    basket_id: basketRow.id,
    product_id: resolvedProducts[index].id,
    product_name: item.name,
    category: scannedItems[index]?.isUnknown ? "Manual Entry" : item.category,
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
      is_manual: Boolean(scannedItems[index]?.isUnknown),
    })),
    store
  );
}

function buildDemoScannedItem(product) {
  return {
    id: createLocalId("scan"),
    barcode: product.barcode,
    name: product.name,
    brand: product.brand,
    quantity: product.quantity,
    customName: product.name,
    isUnknown: false,
  };
}

function pickWeightedPattern(patterns) {
  const totalWeight = patterns.reduce((sum, pattern) => sum + pattern.weight, 0);
  let cursor = Math.random() * totalWeight;

  for (const pattern of patterns) {
    cursor -= pattern.weight;

    if (cursor <= 0) {
      return pattern;
    }
  }

  return patterns[patterns.length - 1];
}

function buildPatternDefinitions() {
  return [
    {
      weight: 26,
      districts: ["Yasamal", "Narimanov", "Nizami"],
      hours: [13, 16],
      items: ["coke", "chips"],
      extras: ["gum", "chocolate"],
    },
    {
      weight: 18,
      districts: ["Yasamal", "Nizami", "Khatai"],
      hours: [12, 16],
      items: ["sprite", "sandwich"],
      extras: ["gum"],
    },
    {
      weight: 17,
      districts: ["Khatai", "Sabail", "Narimanov"],
      hours: [17, 20],
      items: ["fuseTea", "croissant"],
      extras: ["chocolate"],
    },
    {
      weight: 14,
      districts: ["Yasamal", "Sabail", "Narimanov"],
      hours: [11, 18],
      items: ["cokeZero", "localSnack"],
      extras: ["gum"],
    },
    {
      weight: 12,
      districts: ["Narimanov", "Sabail", "Khatai"],
      hours: [8, 11],
      items: ["bonaqua", "croissant"],
      extras: ["gum"],
    },
    {
      weight: 13,
      districts: ["Yasamal", "Narimanov", "Khatai", "Sabail"],
      hours: [10, 21],
      items: ["fanta", "chips"],
      extras: ["localSnack", "gum"],
    },
  ];
}

function createDemoBasketFromPattern({
  createdAt,
  store,
  itemKeys,
  syncState = "seeded",
}) {
  const scannedItems = itemKeys
    .map((key) => DEMO_PRODUCT_CATALOG[key])
    .filter(Boolean)
    .map(buildDemoScannedItem);
  const rewardMeta = evaluateBasketReward(scannedItems, loadLocalBaskets());
  const normalizedStore = normalizeStore(store);

  return {
    id: createLocalId("basket"),
    store_id: normalizedStore.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    store_name: normalizedStore.name,
    district: normalizedStore.district,
    created_at: createdAt,
    total_items: scannedItems.length,
    contains_cci: scannedItems.some((item) => isCciProduct(item.name, item.brand)),
    quality_score: rewardMeta.qualityScore,
    points_awarded: rewardMeta.pointsAwarded,
    sync_state: syncState,
    items: scannedItems.map((item) => ({
      id: createLocalId("basket-item"),
      basket_id: null,
      product_id: item.barcode,
      product_name: item.name,
      category: inferCategory(item.name),
      is_cci_product: isCciProduct(item.name, item.brand),
      quantity: item.quantity,
      is_manual: false,
    })),
  };
}

function generateDemoBaskets(count, { historical = true, startOffsetMinutes = 0 } = {}) {
  const patterns = buildPatternDefinitions();
  const baskets = [];
  const now = new Date();

  for (let index = 0; index < count; index += 1) {
    const pattern = pickWeightedPattern(patterns);
    const district = pattern.districts[index % pattern.districts.length];
    const store = DISTRICT_TO_STORE.get(district) || DEFAULT_DEMO_STORE;
    const [startHour, endHour] = pattern.hours;
    const hourRange = endHour - startHour + 1;
    const hour = startHour + (index % hourRange);
    const minute = (index * 7) % 60;
    const dayOffset = historical ? Math.floor(index / 12) : 0;
    const createdAt = new Date(now);

    if (historical) {
      createdAt.setDate(now.getDate() - dayOffset);
      createdAt.setHours(hour, minute, 0, 0);
    } else {
      createdAt.setMinutes(now.getMinutes() - startOffsetMinutes - index);
    }

    const itemKeys = [...pattern.items];

    if (pattern.extras?.length && index % 3 === 0) {
      itemKeys.push(pattern.extras[index % pattern.extras.length]);
    }

    baskets.push(
      createDemoBasketFromPattern({
        createdAt: createdAt.toISOString(),
        store,
        itemKeys,
        syncState: historical ? "seeded" : "live-demo",
      })
    );
  }

  return baskets.sort((left, right) => new Date(right.created_at) - new Date(left.created_at));
}

function appendLocalBaskets(baskets) {
  const existing = loadLocalBaskets();
  writeLocalBaskets(mergeBaskets(baskets, existing));
  return baskets;
}

function removePendingBasketById(id) {
  writePendingBaskets(loadPendingBaskets().filter((basket) => basket.id !== id));
}

function removeLocalBasketById(id) {
  writeLocalBaskets(loadLocalBaskets().filter((basket) => basket.id !== id));
}

function persistedBasketToScannedItems(basket) {
  return basket.items.map((item) => ({
    id: createLocalId("scan"),
    barcode: null,
    name: item.product_name,
    brand: item.is_cci_product ? "The Coca-Cola Company" : "Demo Catalog",
    quantity: typeof item.quantity === "string" ? item.quantity : "1 item",
    customName: item.product_name,
    isUnknown: Boolean(item.is_manual),
  }));
}

export function getBasketDataMode() {
  return isSupabaseConfigured ? "supabase" : "local";
}

export function getActiveDemoStore() {
  const savedStore = readLocalJson(ACTIVE_STORE_KEY, null);

  if (savedStore?.name && savedStore?.district) {
    return savedStore;
  }

  return DEFAULT_DEMO_STORE;
}

export function setActiveDemoStore(storeInput) {
  const store = normalizeStore(storeInput);
  writeLocalJson(ACTIVE_STORE_KEY, store);
  return store;
}

export function isDemoOfflineMode() {
  return Boolean(readLocalJson(DEMO_OFFLINE_KEY, false));
}

export function setDemoOfflineMode(nextValue) {
  writeLocalJson(DEMO_OFFLINE_KEY, Boolean(nextValue));
  return Boolean(nextValue);
}

export function getDemoAdminState() {
  return {
    activeStore: getActiveDemoStore(),
    offlineMode: isDemoOfflineMode(),
    pendingCount: loadPendingBaskets().length,
    localBasketCount: loadLocalBaskets().length,
  };
}

export function clearLocalDemoBaskets() {
  writeLocalBaskets([]);
  writePendingBaskets([]);
}

export function resetDemoData() {
  clearLocalDemoBaskets();
  setActiveDemoStore(DEFAULT_DEMO_STORE);
  setDemoOfflineMode(false);

  return getDemoAdminState();
}

export function seedRealisticBasketData() {
  const seeded = generateDemoBaskets(48, { historical: true });
  appendLocalBaskets(seeded);
  return seeded;
}

export function generateHistoricalDemoBaskets(count = 100) {
  const seeded = generateDemoBaskets(count, { historical: true });
  appendLocalBaskets(seeded);
  return seeded;
}

export function generateLiveDemoTransactions(count = 10) {
  const transactions = generateDemoBaskets(count, {
    historical: false,
    startOffsetMinutes: 0,
  });
  appendLocalBaskets(transactions);
  return transactions;
}

export async function syncOfflineDemoBaskets() {
  if (!isSupabaseConfigured || isDemoOfflineMode()) {
    return {
      synced: 0,
      skipped: loadPendingBaskets().length,
    };
  }

  const pending = loadPendingBaskets();
  let synced = 0;

  for (const basket of pending) {
    const scannedItems = persistedBasketToScannedItems(basket);
    await saveSupabaseBasket(scannedItems, {
      createdAt: basket.created_at,
      store: {
        name: basket.store_name,
        district: basket.district,
      },
    });
    removePendingBasketById(basket.id);
    removeLocalBasketById(basket.id);
    synced += 1;
  }

  return {
    synced,
    skipped: 0,
  };
}

export async function fetchPersistedBaskets() {
  const localBaskets = loadLocalBaskets();

  if (!isSupabaseConfigured) {
    return localBaskets;
  }

  const remoteBaskets = await loadSupabaseBaskets();
  return mergeBaskets(remoteBaskets, localBaskets);
}

export async function persistBasket(scannedItems, options = {}) {
  if (!isSupabaseConfigured || isDemoOfflineMode() || options.forceLocal) {
    return saveLocalBasket(scannedItems, {
      ...options,
      syncState:
        isSupabaseConfigured && (isDemoOfflineMode() || options.forceLocal)
          ? "pending"
          : "local",
      store: options.store || getActiveDemoStore(),
    });
  }

  return saveSupabaseBasket(scannedItems, {
    ...options,
    store: options.store || getActiveDemoStore(),
  });
}

export function subscribeToBasketChanges(onChange, onError) {
  if (!isSupabaseConfigured || !supabase) {
    return () => {};
  }

  const channel = supabase
    .channel("scan-baskets-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "baskets" }, onChange)
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
