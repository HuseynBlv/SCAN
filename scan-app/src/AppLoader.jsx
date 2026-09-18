import { lazy } from "react";

const selectedPortal = new URLSearchParams(window.location.search).get("portal");

let loadApp;

if (import.meta.env.VITE_ENABLE_LEGACY_SCANNER === "true") {
  loadApp = () => import("./App.jsx");
} else if (selectedPortal === "retailer") {
  loadApp = () => import("./components/RetailerDashboard.jsx");
} else if (selectedPortal === "connection" || selectedPortal === "connect") {
  loadApp = () => import("./components/DataConnection.jsx");
} else if (selectedPortal === "onboarding") {
  loadApp = () => import("./components/Onboarding.jsx");
} else {
  loadApp = () => import("./components/CciDashboard.jsx");
}

const AppLoader = lazy(loadApp);

export default AppLoader;
