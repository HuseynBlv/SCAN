import { lazy } from "react";

const selectedPortal = new URLSearchParams(window.location.search).get("portal");

const AppLoader = lazy(() =>
  import.meta.env.VITE_ENABLE_LEGACY_SCANNER === "true"
    ? import("./App.jsx")
    : selectedPortal === "retailer"
      ? import("./components/RetailerDashboard.jsx")
      : import("./components/CciDashboard.jsx")
);

export default AppLoader;
