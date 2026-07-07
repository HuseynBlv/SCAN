/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";

const STORE_SESSION_KEY = "scan:store-session";

const AuthContext = createContext(null);

function readSession() {
  try {
    const value = window.localStorage.getItem(STORE_SESSION_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function writeSession(value) {
  window.localStorage.setItem(STORE_SESSION_KEY, JSON.stringify(value));
}

function normalizeStoreCode(storeCode) {
  return `${storeCode || ""}`.trim().toUpperCase();
}

export function AuthProvider({ children }) {
  const [storeSession, setStoreSession] = useState(readSession);
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

      writeSession(nextSession);
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
    window.localStorage.removeItem(STORE_SESSION_KEY);
    setStoreSession(null);
  }, []);

  const value = useMemo(
    () => ({
      storeSession,
      authLoading,
      authError,
      isStoreAuthenticated: Boolean(storeSession),
      loginStore,
      logoutStore,
    }),
    [authError, authLoading, loginStore, logoutStore, storeSession]
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
