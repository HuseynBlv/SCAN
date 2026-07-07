import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useHQAuth } from "../contexts/HQAuthContext";

export function StoreProtectedRoute() {
  const { isStoreAuthenticated } = useAuth();
  const location = useLocation();

  if (!isStoreAuthenticated) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

export function HQProtectedRoute() {
  const { isHQAuthenticated } = useHQAuth();
  const location = useLocation();

  if (!isHQAuthenticated) {
    return <Navigate to="/hq-login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
