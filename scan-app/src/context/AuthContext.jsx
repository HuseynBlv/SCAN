/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";

const STORE_SESSION_KEY = "scan:store-session";
const HQ_SESSION_KEY = "scan:hq-session";
const HQ_PASSWORD = import.meta.env.VITE_HQ_PASSWORD;

const AuthContext = createContext(null);

function readSession(key) {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function writeSession(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function clearSession(key) {
  window.localStorage.removeItem(key);
}

function normalizeStoreCode(storeCode) {
  return `${storeCode || ""}`.trim().toUpperCase();
}

function redirectTo(path) {
  if (window.location.pathname === path) {
    return;
  }

  window.history.replaceState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function AuthProvider({ children }) {
  const [storeSession, setStoreSession] = useState(() =>
    readSession(STORE_SESSION_KEY)
  );
  const [hqSession, setHqSession] = useState(() => readSession(HQ_SESSION_KEY));
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  const loginStore = useCallback(async ({ storeCode, pin }) => {
    const normalizedStoreCode = normalizeStoreCode(storeCode);
    const normalizedPin = `${pin || ""}`.trim();

    setAuthError("");

    if (!isSupabaseConfigured || !supabase) {
      const message = "Supabase unavailable. Store login cannot be verified.";
      setAuthError(message);
      return { ok: false, error: message };
    }

    if (!normalizedStoreCode || !/^\d{4}$/.test(normalizedPin)) {
      const message = "Enter a valid store code and 4-digit PIN.";
      setAuthError(message);
      return { ok: false, error: message };
    }

    setAuthLoading(true);

    try {
      const { data, error } = await supabase.rpc("login_store", {
        p_store_code: normalizedStoreCode,
        p_pin: normalizedPin,
      });

      if (error) {
        throw error;
      }

      const store = Array.isArray(data) ? data[0] : data;

      if (!store?.store_id) {
        const message = "Invalid store code or PIN.";
        setAuthError(message);
        return { ok: false, error: message };
      }

      if (store.is_active === false) {
        const message = "This store is not active yet. Contact CCI support.";
        setAuthError(message);
        return { ok: false, error: message };
      }

      const nextSession = {
        store_id: store.store_id,
        store_code: store.store_code,
        store_name: store.store_name,
        district: store.district,
        owner_name: store.owner_name,
        phone: store.phone,
        is_active: store.is_active,
        last_seen: store.last_seen,
        logged_in_at: new Date().toISOString(),
      };

      writeSession(STORE_SESSION_KEY, nextSession);
      setStoreSession(nextSession);
      return { ok: true, store: nextSession };
    } catch (error) {
      const message = error?.message || "Store login failed. Please try again.";
      setAuthError(message);
      return { ok: false, error: message };
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const logoutStore = useCallback(() => {
    clearSession(STORE_SESSION_KEY);
    setStoreSession(null);
  }, []);

  const loginHq = useCallback((password) => {
    const attemptedPassword = `${password || ""}`;

    setAuthError("");

    if (!HQ_PASSWORD) {
      const message = "HQ password is not configured. Set VITE_HQ_PASSWORD.";
      setAuthError(message);
      return { ok: false, error: message };
    }

    if (attemptedPassword !== HQ_PASSWORD) {
      const message = "Invalid HQ password.";
      setAuthError(message);
      return { ok: false, error: message };
    }

    const nextSession = {
      role: "hq",
      logged_in_at: new Date().toISOString(),
    };

    writeSession(HQ_SESSION_KEY, nextSession);
    setHqSession(nextSession);
    return { ok: true };
  }, []);

  const logoutHq = useCallback(() => {
    clearSession(HQ_SESSION_KEY);
    setHqSession(null);
  }, []);

  const protectCurrentRoute = useCallback(() => {
    const pathname = window.location.pathname;

    if (pathname.startsWith("/cashier") && !storeSession) {
      redirectTo("/login");
      return false;
    }

    if (pathname === "/login" && storeSession) {
      redirectTo("/cashier");
      return true;
    }

    if (pathname.startsWith("/hq") && pathname !== "/hq-login" && !hqSession) {
      redirectTo("/hq-login");
      return false;
    }

    if (pathname === "/hq-login" && hqSession) {
      redirectTo("/hq");
      return true;
    }

    return true;
  }, [hqSession, storeSession]);

  useEffect(() => {
    protectCurrentRoute();

    const handleRouteChange = () => {
      protectCurrentRoute();
    };

    window.addEventListener("popstate", handleRouteChange);

    return () => {
      window.removeEventListener("popstate", handleRouteChange);
    };
  }, [protectCurrentRoute]);

  const value = useMemo(
    () => ({
      storeSession,
      hqSession,
      authLoading,
      authError,
      isStoreAuthenticated: Boolean(storeSession),
      isHqAuthenticated: Boolean(hqSession),
      loginStore,
      logoutStore,
      loginHq,
      logoutHq,
      protectCurrentRoute,
    }),
    [
      authError,
      authLoading,
      hqSession,
      loginHq,
      loginStore,
      logoutHq,
      logoutStore,
      protectCurrentRoute,
      storeSession,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
}

export function StoreProtected({ children, fallback = null }) {
  const { isStoreAuthenticated } = useAuth();

  return isStoreAuthenticated ? children : fallback;
}

export function HqProtected({ children, fallback = null }) {
  const { isHqAuthenticated } = useAuth();

  return isHqAuthenticated ? children : fallback;
}
