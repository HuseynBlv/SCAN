import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const PRIMARY_RED = "#E61C24";

export default function StoreLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const { authError, authLoading, isStoreAuthenticated, loginStore } = useAuth();
  const [storeCode, setStoreCode] = useState("");
  const [pin, setPin] = useState("");

  if (isStoreAuthenticated) {
    return <Navigate to="/cashier" replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    const result = await loginStore({ storeCode, pin });

    if (result.ok) {
      navigate(location.state?.from?.pathname || "/cashier", { replace: true });
    }
  };

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <div style={styles.logo}>SCAN</div>
        <h1 style={styles.title}>Store login</h1>
        <p style={styles.copy}>Use your CCI store code and 4-digit PIN.</p>

        <form style={styles.form} onSubmit={handleSubmit}>
          <label style={styles.label} htmlFor="store-code">
            Store code
          </label>
          <input
            autoComplete="username"
            id="store-code"
            inputMode="text"
            placeholder="NAR-047"
            style={styles.input}
            value={storeCode}
            onChange={(event) => setStoreCode(event.target.value.toUpperCase())}
          />

          <label style={styles.label} htmlFor="store-pin">
            4-digit PIN
          </label>
          <input
            autoComplete="current-password"
            id="store-pin"
            inputMode="numeric"
            maxLength={4}
            placeholder="0470"
            style={styles.input}
            type="password"
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
          />

          {authError ? <div style={styles.error}>{authError}</div> : null}

          <button disabled={authLoading} style={styles.button} type="submit">
            {authLoading ? "Checking..." : "Open cashier app"}
          </button>
        </form>
      </section>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: 20,
    background: "linear-gradient(180deg, #fff, #f4f6f8)",
    color: "#17191d",
  },
  card: {
    width: "min(100%, 420px)",
    border: "1px solid rgba(17,17,17,0.08)",
    borderRadius: 20,
    padding: 24,
    background: "#fff",
    boxShadow: "0 22px 54px rgba(17,17,17,0.10)",
  },
  logo: {
    width: 58,
    height: 58,
    borderRadius: 16,
    display: "grid",
    placeItems: "center",
    marginBottom: 18,
    background: PRIMARY_RED,
    color: "#fff",
    fontWeight: 900,
    letterSpacing: 1,
  },
  title: {
    margin: 0,
    fontSize: 28,
    lineHeight: 1.1,
  },
  copy: {
    margin: "10px 0 22px",
    color: "#666d78",
    lineHeight: 1.45,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  label: {
    fontSize: 13,
    fontWeight: 800,
    color: "#3c424c",
  },
  input: {
    border: "1px solid rgba(17,17,17,0.12)",
    borderRadius: 12,
    padding: "13px 14px",
    fontSize: 16,
  },
  error: {
    borderRadius: 12,
    padding: "11px 12px",
    background: "rgba(230,28,36,0.08)",
    color: PRIMARY_RED,
    fontSize: 14,
    fontWeight: 700,
  },
  button: {
    marginTop: 8,
    border: 0,
    borderRadius: 14,
    padding: "14px 16px",
    background: PRIMARY_RED,
    color: "#fff",
    fontWeight: 900,
    letterSpacing: 0.3,
  },
};
