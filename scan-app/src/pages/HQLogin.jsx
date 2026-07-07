import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useHQAuth } from "../contexts/HQAuthContext";

const PRIMARY_RED = "#E61C24";

export default function HQLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const { hqAuthError, isHQAuthenticated, loginHQ } = useHQAuth();
  const [password, setPassword] = useState("");

  if (isHQAuthenticated) {
    return <Navigate to="/hq/dashboard" replace />;
  }

  const handleSubmit = (event) => {
    event.preventDefault();
    const result = loginHQ(password);

    if (result.ok) {
      navigate(location.state?.from?.pathname || "/hq/dashboard", { replace: true });
    }
  };

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <div style={styles.kicker}>CCI Azerbaijan</div>
        <h1 style={styles.title}>HQ access</h1>
        <p style={styles.copy}>Enter the SCAN HQ password to open the dashboard.</p>

        <form style={styles.form} onSubmit={handleSubmit}>
          <label style={styles.label} htmlFor="hq-password">
            HQ password
          </label>
          <input
            autoComplete="current-password"
            id="hq-password"
            placeholder="Enter HQ password"
            style={styles.input}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          {hqAuthError ? <div style={styles.error}>{hqAuthError}</div> : null}

          <button style={styles.button} type="submit">
            Open HQ dashboard
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
    background: "#f5f6f8",
    color: "#17191d",
  },
  card: {
    width: "min(100%, 440px)",
    border: "1px solid rgba(17,17,17,0.08)",
    borderRadius: 18,
    padding: 26,
    background: "#fff",
    boxShadow: "0 22px 54px rgba(17,17,17,0.10)",
  },
  kicker: {
    color: PRIMARY_RED,
    fontSize: 13,
    fontWeight: 900,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  title: {
    margin: 0,
    fontSize: 30,
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
