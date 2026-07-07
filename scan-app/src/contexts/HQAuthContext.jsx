/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

const HQ_SESSION_KEY = "scan:hq-session";
const HQ_PASSWORD = import.meta.env.VITE_HQ_PASSWORD;

const HQAuthContext = createContext(null);

function readSession() {
  try {
    const value = window.localStorage.getItem(HQ_SESSION_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function writeSession(value) {
  window.localStorage.setItem(HQ_SESSION_KEY, JSON.stringify(value));
}

export function HQAuthProvider({ children }) {
  const [hqSession, setHqSession] = useState(readSession);
  const [hqAuthError, setHqAuthError] = useState("");

  const loginHQ = useCallback((password) => {
    const attemptedPassword = `${password || ""}`;

    setHqAuthError("");

    if (!HQ_PASSWORD) {
      const message = "HQ password is not configured. Set VITE_HQ_PASSWORD.";
      setHqAuthError(message);
      return { ok: false, error: message };
    }

    if (attemptedPassword !== HQ_PASSWORD) {
      const message = "Invalid HQ password.";
      setHqAuthError(message);
      return { ok: false, error: message };
    }

    const nextSession = {
      role: "hq",
      logged_in_at: new Date().toISOString(),
    };

    writeSession(nextSession);
    setHqSession(nextSession);
    return { ok: true };
  }, []);

  const logoutHQ = useCallback(() => {
    window.localStorage.removeItem(HQ_SESSION_KEY);
    setHqSession(null);
  }, []);

  const value = useMemo(
    () => ({
      hqSession,
      hqAuthError,
      isHQAuthenticated: Boolean(hqSession),
      loginHQ,
      logoutHQ,
    }),
    [hqAuthError, hqSession, loginHQ, logoutHQ]
  );

  return <HQAuthContext.Provider value={value}>{children}</HQAuthContext.Provider>;
}

export function useHQAuth() {
  const context = useContext(HQAuthContext);

  if (!context) {
    throw new Error("useHQAuth must be used inside HQAuthProvider.");
  }

  return context;
}
