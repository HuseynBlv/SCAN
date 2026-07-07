const OFFLINE_QUEUE_KEY = "scan:offline-queue";

export function readOfflineQueue() {
  try {
    return JSON.parse(window.localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function writeOfflineQueue(items) {
  window.localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(items));
}

export function clearOfflineQueue() {
  window.localStorage.removeItem(OFFLINE_QUEUE_KEY);
}
