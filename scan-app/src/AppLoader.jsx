import { lazy } from "react";
import { selectApp } from "./appSelection";

const appLoaders = {
  cci: () => import("./components/CciDashboard.jsx"),
  connection: () => import("./components/DataConnection.jsx"),
  landing: () => import("./components/landing/LandingPage.jsx"),
  legacy: () => import("./App.jsx"),
  onboarding: () => import("./components/Onboarding.jsx"),
  retailer: () => import("./components/RetailerDashboard.jsx"),
};

const selectedApp = selectApp(
  window.location.search,
  import.meta.env.VITE_ENABLE_LEGACY_SCANNER === "true",
);
const loadApp = appLoaders[selectedApp];

const AppLoader = lazy(loadApp);

export default AppLoader;
