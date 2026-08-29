export function compactChartLabel(value) {
  const label = `${value || ""}`.trim();
  return label.length > 18 ? `${label.slice(0, 17).trimEnd()}…` : label;
}
