import { ScanApiError, apiUrl, basicAuthorization, errorMessage } from "./scanApi";

async function request(method, path, { username, password, body, signal } = {}) {
  let response;
  try {
    response = await fetch(apiUrl(path), {
      method,
      signal,
      headers: {
        Accept: "application/json",
        Authorization: basicAuthorization(username, password),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (error?.name === "AbortError" || error instanceof ScanApiError) throw error;
    throw new ScanApiError("Cannot reach the SCAN API. Check your connection and try again.");
  }
  if (!response.ok) throw new ScanApiError(await errorMessage(response), response.status);
  if (response.status === 204) return null;
  try {
    return await response.json();
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new ScanApiError("The SCAN API did not return a readable response.");
  }
}

function query(params) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") search.set(key, value);
  });
  const text = search.toString();
  return text ? `?${text}` : "";
}

// --- Investigations ---------------------------------------------------

export function fetchInvestigations({ retailerCode, openOnly, username, password, signal }) {
  return request("GET", `/api/v1/investigations${query({ retailerCode, openOnly })}`, { username, password, signal });
}

export function fetchInvestigation({ retailerCode, investigationId, username, password, signal }) {
  return request("GET", `/api/v1/investigations/${investigationId}${query({ retailerCode })}`, { username, password, signal });
}

export function openProductInvestigation({ retailerCode, productName, periodDays, username, password }) {
  return request("POST", `/api/v1/investigations/product${query({ retailerCode })}`, {
    username, password, body: { productName, periodDays },
  });
}

export function openGeneralInvestigation({ retailerCode, title, question, username, password }) {
  return request("POST", `/api/v1/investigations/general${query({ retailerCode })}`, {
    username, password, body: { title, question },
  });
}

export function addInvestigationNote({ retailerCode, investigationId, body, username, password }) {
  return request("POST", `/api/v1/investigations/${investigationId}/notes${query({ retailerCode })}`, {
    username, password, body: { body },
  });
}

export function addInvestigationHypothesis({
  retailerCode, investigationId, statement, supportingEvidence, contradictingEvidence, confidence, username, password,
}) {
  return request("POST", `/api/v1/investigations/${investigationId}/hypotheses${query({ retailerCode })}`, {
    username, password, body: { statement, supportingEvidence, contradictingEvidence, confidence },
  });
}

export function confirmHypothesis({ retailerCode, investigationId, hypothesisId, username, password }) {
  return request("POST", `/api/v1/investigations/${investigationId}/hypotheses/${hypothesisId}/confirm${query({ retailerCode })}`, { username, password });
}

export function rejectHypothesis({ retailerCode, investigationId, hypothesisId, username, password }) {
  return request("POST", `/api/v1/investigations/${investigationId}/hypotheses/${hypothesisId}/reject${query({ retailerCode })}`, { username, password });
}

export function closeInvestigation({ retailerCode, investigationId, username, password }) {
  return request("POST", `/api/v1/investigations/${investigationId}/close${query({ retailerCode })}`, { username, password });
}

export function reopenInvestigation({ retailerCode, investigationId, username, password }) {
  return request("POST", `/api/v1/investigations/${investigationId}/reopen${query({ retailerCode })}`, { username, password });
}

// --- Field tasks ---------------------------------------------------

export function fetchFieldTasks({ retailerCode, username, password, signal }) {
  return request("GET", `/api/v1/field-tasks${query({ retailerCode })}`, { username, password, signal });
}

export function fetchFieldTask({ retailerCode, taskId, username, password, signal }) {
  return request("GET", `/api/v1/field-tasks/${taskId}${query({ retailerCode })}`, { username, password, signal });
}

export function createFieldTask({
  retailerCode, investigationId, title, reason, assignedTo, dueAt, storeIds, username, password,
}) {
  return request("POST", `/api/v1/field-tasks${query({ retailerCode })}`, {
    username, password, body: { investigationId, title, reason, assignedTo, dueAt, storeIds },
  });
}

export function recordFieldTaskResult({
  retailerCode, taskId, externalStoreId, stockAvailable, visibleInCooler, correctPlacement, competitorPresent, note, username, password,
}) {
  return request(
    "POST",
    `/api/v1/field-tasks/${taskId}/results/${encodeURIComponent(externalStoreId)}${query({ retailerCode })}`,
    { username, password, body: { stockAvailable, visibleInCooler, correctPlacement, competitorPresent, note } }
  );
}

// --- Copilot ---------------------------------------------------

export function askCopilot({
  retailerCode, contextType, subjectName, investigationId, periodDays, question, username, password,
}) {
  return request("POST", `/api/v1/copilot/ask${query({ retailerCode })}`, {
    username, password, body: { contextType, subjectName, investigationId, periodDays, question },
  });
}

// Product and general questions only - aggregated across every retailer this account can see,
// with no retailerCode parameter. An investigation belongs to one retailer, so investigation
// questions still go through askCopilot above.
export function askNetworkCopilot({ contextType, subjectName, periodDays, question, username, password }) {
  return request("POST", "/api/v1/network/copilot/ask", {
    username, password, body: { contextType, subjectName, periodDays, question },
  });
}

// --- Meeting briefs ---------------------------------------------------

export function fetchMeetingBrief({ retailerCode, template, periodDays, username, password, signal }) {
  return request("GET", `/api/v1/meeting-briefs${query({ retailerCode, template, periodDays })}`, { username, password, signal });
}

// --- Movers (what needs attention) ---------------------------------------------------

export function fetchMovers({ retailerCode, periodDays, limit, username, password, signal }) {
  return request("GET", `/api/v1/analytics/movers${query({ retailerCode, periodDays, limit })}`, { username, password, signal });
}

// --- Watchlist ---------------------------------------------------

export function fetchWatchlist({ retailerCode, username, password, signal }) {
  return request("GET", `/api/v1/watchlist${query({ retailerCode })}`, { username, password, signal });
}

export function followProduct({ retailerCode, productName, username, password }) {
  return request("POST", `/api/v1/watchlist${query({ retailerCode })}`, { username, password, body: { productName } });
}

export function unfollowProduct({ retailerCode, itemId, username, password }) {
  return request("DELETE", `/api/v1/watchlist/${itemId}${query({ retailerCode })}`, { username, password });
}

export function fetchWatchlistChanges({ retailerCode, periodDays, username, password, signal }) {
  return request("GET", `/api/v1/watchlist/changes${query({ retailerCode, periodDays })}`, { username, password, signal });
}

// --- Activations ---------------------------------------------------

export function fetchActivations({ retailerCode, username, password, signal }) {
  return request("GET", `/api/v1/activations${query({ retailerCode })}`, { username, password, signal });
}

export function fetchActivation({ retailerCode, activationId, username, password, signal }) {
  return request("GET", `/api/v1/activations/${activationId}${query({ retailerCode })}`, { username, password, signal });
}

export function createActivation({
  retailerCode, name, objective, hypothesis, productName, primaryMetric, startDate, endDate,
  testStoreIds, controlStoreIds, username, password,
}) {
  return request("POST", `/api/v1/activations${query({ retailerCode })}`, {
    username, password,
    body: { name, objective, hypothesis, productName, primaryMetric, startDate, endDate, testStoreIds, controlStoreIds },
  });
}

// --- Network (all stores, aggregated across every retailer this account can see) ---------------------------------------------------

export function fetchNetworkOverview({ periodDays, username, password, signal }) {
  return request("GET", `/api/v1/network/overview${query({ periodDays })}`, { username, password, signal });
}

export function fetchNetworkStores({ periodDays, username, password, signal }) {
  return request("GET", `/api/v1/network/stores${query({ periodDays })}`, { username, password, signal });
}

export function fetchNetworkProductMovers({ periodDays, limit, username, password, signal }) {
  return request("GET", `/api/v1/network/movers/products${query({ periodDays, limit })}`, { username, password, signal });
}

export function fetchNetworkCategoryMovers({ periodDays, limit, username, password, signal }) {
  return request("GET", `/api/v1/network/movers/categories${query({ periodDays, limit })}`, { username, password, signal });
}

export function fetchNetworkBrief({ periodDays, username, password, signal }) {
  return request("GET", `/api/v1/network/brief${query({ periodDays })}`, { username, password, signal });
}

export function fetchStoreDetail({ retailerCode, externalStoreId, periodDays, username, password, signal }) {
  return request("GET", `/api/v1/network/stores/detail${query({ retailerCode, externalStoreId, periodDays })}`, { username, password, signal });
}

export function fetchProductDetail({ product, periodDays, username, password, signal }) {
  return request("GET", `/api/v1/network/products/detail${query({ product, periodDays })}`, { username, password, signal });
}
