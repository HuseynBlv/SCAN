export function detectFastBasketSubmission(recentBaskets, thresholdMs = 5000) {
  if (recentBaskets.length < 2) {
    return false;
  }

  const [latest, previous] = recentBaskets;
  return (
    Math.abs(new Date(latest.scanned_at || latest.created_at) - new Date(previous.scanned_at || previous.created_at)) <
    thresholdMs
  );
}

export function detectLowVariety(items) {
  return new Set(items.map((item) => item.product_id || item.product_name)).size <= 1;
}
