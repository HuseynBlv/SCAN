export function selectApp(search, legacyScannerEnabled = false) {
  if (legacyScannerEnabled) return "legacy"

  const selectedPortal = new URLSearchParams(search).get("portal")
  if (selectedPortal === "retailer") return "retailer"
  if (selectedPortal === "cci") return "cci"
  if (selectedPortal === "connection" || selectedPortal === "connect") return "connection"
  if (selectedPortal === "onboarding") return "onboarding"
  return "landing"
}
