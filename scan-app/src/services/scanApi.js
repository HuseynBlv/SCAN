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

function normalizedArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeOverview(data) {
  if (!data || typeof data !== "object" || typeof data.retailerCode !== "string") {
    throw new ScanApiError("SCAN API returned an unexpected analytics response.");
  }

  return {
    ...data,
    totalBaskets: Number(data.totalBaskets || 0),
    cciBaskets: Number(data.cciBaskets || 0),
    cciPenetrationPercentage: Number(data.cciPenetrationPercentage || 0),
    averageBasketValue: Number(data.averageBasketValue || 0),
    mappedLinePercentage: Number(data.mappedLinePercentage || 0),
    topCompanionProducts: normalizedArray(data.topCompanionProducts),
    topCompanionCategories: normalizedArray(data.topCompanionCategories),
    cciSkuPerformance: normalizedArray(data.cciSkuPerformance),
    dayparts: normalizedArray(data.dayparts),
    weekdayWeekend: normalizedArray(data.weekdayWeekend),
    stores: normalizedArray(data.stores),
    insights: normalizedArray(data.insights),
  };
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
      "Cannot reach the SCAN API. Confirm Spring Boot is running on port 8080."
    );
  }

  if (!response.ok) {
    throw new ScanApiError(await errorMessage(response), response.status);
  }

  return normalizeOverview(await response.json());
}
