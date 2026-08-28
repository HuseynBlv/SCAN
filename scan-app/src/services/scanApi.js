const DEFAULT_RETAILER_CODE = "KAGGLE";

export class ScanApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "ScanApiError";
    this.status = status;
  }
}

function apiUrl(path) {
  const baseUrl = `${import.meta.env.VITE_SCAN_API_BASE_URL || ""}`.replace(/\/$/, "");
  return `${baseUrl}${path}`;
}

function basicAuthorization(username, password) {
  try {
    return `Basic ${window.btoa(`${username}:${password}`)}`;
  } catch {
    throw new ScanApiError("Username and password must use standard Latin characters.");
  }
}

async function errorMessage(response) {
  if ([502, 503, 504].includes(response.status)) {
    return "The SCAN API is temporarily unavailable. If the demo is waking up, wait a minute and try again.";
  }
  if (response.status === 401) {
    return "The username or password is incorrect.";
  }
  if (response.status === 403) {
    return "This account cannot access the selected retailer's analytics.";
  }

  try {
    const body = await response.json();
    return body.message || body.error || `SCAN API returned ${response.status}.`;
  } catch {
    return `SCAN API returned ${response.status}.`;
  }
}

function contractError(field) {
  throw new ScanApiError(`SCAN API returned an invalid analytics field: ${field}.`);
}

function requiredString(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    contractError(field);
  }
  return value;
}

function requiredTimestamp(value, field) {
  const timestamp = requiredString(value, field);
  if (Number.isNaN(Date.parse(timestamp))) {
    contractError(field);
  }
  return timestamp;
}

function requiredNumber(value, field) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    contractError(field);
  }
  return value;
}

function requiredNonNegativeNumber(value, field) {
  const number = requiredNumber(value, field);
  if (number < 0) {
    contractError(field);
  }
  return number;
}

function requiredCount(value, field) {
  const number = requiredNonNegativeNumber(value, field);
  if (!Number.isSafeInteger(number)) {
    contractError(field);
  }
  return number;
}

function requiredPercentage(value, field) {
  const number = requiredNonNegativeNumber(value, field);
  if (number > 100) {
    contractError(field);
  }
  return number;
}

function requiredArray(value, field, normalizeItem) {
  if (!Array.isArray(value)) {
    contractError(field);
  }
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      contractError(`${field}[${index}]`);
    }
    return normalizeItem(item, `${field}[${index}]`);
  });
}

function metric(item, field, labelField) {
  return {
    ...item,
    [labelField]: requiredString(item[labelField], `${field}.${labelField}`),
    basketCount: requiredCount(item.basketCount, `${field}.basketCount`),
  };
}

function normalizeOverview(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new ScanApiError("SCAN API returned an unexpected analytics response.");
  }

  const normalized = {
    ...data,
    generatedAt: requiredTimestamp(data.generatedAt, "generatedAt"),
    retailerCode: requiredString(data.retailerCode, "retailerCode"),
    retailerName: requiredString(data.retailerName, "retailerName"),
    totalBaskets: requiredCount(data.totalBaskets, "totalBaskets"),
    cciBaskets: requiredCount(data.cciBaskets, "cciBaskets"),
    cciPenetrationPercentage: requiredPercentage(
      data.cciPenetrationPercentage,
      "cciPenetrationPercentage"
    ),
    averageBasketValue: requiredNonNegativeNumber(
      data.averageBasketValue,
      "averageBasketValue"
    ),
    currency: requiredString(data.currency, "currency"),
    mappedLinePercentage: requiredPercentage(data.mappedLinePercentage, "mappedLinePercentage"),
    topCompanionProducts: requiredArray(
      data.topCompanionProducts,
      "topCompanionProducts",
      (item, field) => ({
        ...metric(item, field, "name"),
        attachmentRatePercentage: requiredPercentage(
          item.attachmentRatePercentage,
          `${field}.attachmentRatePercentage`
        ),
      })
    ),
    topCompanionCategories: requiredArray(
      data.topCompanionCategories,
      "topCompanionCategories",
      (item, field) => ({
        ...metric(item, field, "category"),
        attachmentRatePercentage: requiredPercentage(
          item.attachmentRatePercentage,
          `${field}.attachmentRatePercentage`
        ),
      })
    ),
    cciSkuPerformance: requiredArray(data.cciSkuPerformance, "cciSkuPerformance", (item, field) => ({
      ...metric(item, field, "product"),
      productId: requiredString(item.productId, `${field}.productId`),
      quantity: requiredNonNegativeNumber(item.quantity, `${field}.quantity`),
      revenue: requiredNonNegativeNumber(item.revenue, `${field}.revenue`),
    })),
    dayparts: requiredArray(data.dayparts, "dayparts", (item, field) => ({
      ...metric(item, field, "segment"),
      sharePercentage: requiredPercentage(item.sharePercentage, `${field}.sharePercentage`),
    })),
    weekdayWeekend: requiredArray(data.weekdayWeekend, "weekdayWeekend", (item, field) => ({
      ...metric(item, field, "segment"),
      sharePercentage: requiredPercentage(item.sharePercentage, `${field}.sharePercentage`),
    })),
    stores: requiredArray(data.stores, "stores", (item, field) => ({
      ...metric(item, field, "storeId"),
      cciBasketCount: requiredCount(item.cciBasketCount, `${field}.cciBasketCount`),
      cciPenetrationPercentage: requiredPercentage(
        item.cciPenetrationPercentage,
        `${field}.cciPenetrationPercentage`
      ),
      averageBasketValue: requiredNonNegativeNumber(
        item.averageBasketValue,
        `${field}.averageBasketValue`
      ),
    })),
    insights: requiredArray(data.insights, "insights", (item, field) => ({
      fact: requiredString(item.fact, `${field}.fact`),
      interpretation: requiredString(item.interpretation, `${field}.interpretation`),
      recommendedAction: requiredString(item.recommendedAction, `${field}.recommendedAction`),
    })),
  };

  if (normalized.cciBaskets > normalized.totalBaskets) {
    contractError("cciBaskets");
  }
  normalized.stores.forEach((store, index) => {
    if (store.cciBasketCount > store.basketCount) {
      contractError(`stores[${index}].cciBasketCount`);
    }
  });
  return normalized;
}

export function configuredRetailerCode() {
  return `${import.meta.env.VITE_SCAN_RETAILER_CODE || DEFAULT_RETAILER_CODE}`
    .trim()
    .toUpperCase();
}

export async function fetchOverview({ retailerCode, username, password, signal }) {
  let response;
  try {
    response = await fetch(
      apiUrl(`/api/v1/analytics/overview?retailerCode=${encodeURIComponent(retailerCode)}`),
      {
        signal,
        headers: {
          Accept: "application/json",
          Authorization: basicAuthorization(username, password),
        },
      }
    );
  } catch (error) {
    if (error?.name === "AbortError") {
      throw error;
    }
    if (error instanceof ScanApiError) {
      throw error;
    }
    throw new ScanApiError(
      "Cannot reach the SCAN API. Check your connection and that the API is running. A sleeping demo may need a minute before you retry."
    );
  }

  if (!response.ok) {
    throw new ScanApiError(await errorMessage(response), response.status);
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    if (error?.name === "AbortError") {
      throw error;
    }
    throw new ScanApiError(
      "The SCAN API did not return readable analytics. If the demo is waking up, wait a minute and try again."
    );
  }
  return normalizeOverview(data);
}
