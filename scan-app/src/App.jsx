import { Navigate, Route, Routes } from "react-router-dom";
import {
  HQProtectedRoute,
  StoreProtectedRoute,
} from "./components/ProtectedRoutes";
import AdminPanel from "./pages/AdminPanel";
import CashierApp from "./pages/CashierApp";
import HQDashboard from "./pages/HQDashboard";
import HQLogin from "./pages/HQLogin";
import StoreLogin from "./pages/StoreLogin";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<StoreLogin />} />
      <Route path="/hq" element={<HQLogin />} />
      <Route path="/hq-login" element={<HQLogin />} />

      <Route element={<StoreProtectedRoute />}>
        <Route path="/cashier" element={<CashierApp />} />
      </Route>

      <Route element={<HQProtectedRoute />}>
        <Route path="/hq/dashboard" element={<HQDashboard />} />
        <Route path="/admin" element={<AdminPanel />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
