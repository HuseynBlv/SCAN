import { lazy } from "react";

const AppLoader = lazy(() =>
  import.meta.env.VITE_ENABLE_LEGACY_SCANNER === "true"
    ? import("./App.jsx")
    : import("./components/CciDashboard.jsx")
);

export default AppLoader;
