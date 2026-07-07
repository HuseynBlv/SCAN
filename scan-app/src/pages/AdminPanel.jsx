import { useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";

const PRIMARY_RED = "#E61C24";

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export default function AdminPanel() {
  const [form, setForm] = useState({
    store_code: "",
    store_name: "",
    district: "",
    owner_name: "",
    phone: "",
    pin: "",
  });
  const [status, setStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setStatus("");

    if (!isSupabaseConfigured || !supabase) {
      setStatus("Supabase is not configured.");
      return;
    }

    if (!/^\d{4}$/.test(form.pin)) {
      setStatus("PIN must be exactly 4 digits.");
      return;
    }

    setIsSaving(true);

    try {
      const pinHash = await sha256(form.pin);
      const storeName = form.store_name.trim();
      const district = form.district.trim();

      const { error } = await supabase.from("stores").upsert(
        {
          store_code: form.store_code.trim().toUpperCase(),
          store_name: storeName,
          name: `${storeName} — ${district}`,
          district,
          owner_name: form.owner_name.trim(),
          phone: form.phone.trim(),
          pin_hash: pinHash,
          is_active: true,
        },
        { onConflict: "store_code" }
      );

      if (error) {
        throw error;
      }

      setStatus(`Store ${form.store_code.toUpperCase()} is active.`);
      setForm({
        store_code: "",
        store_name: "",
        district: "",
        owner_name: "",
        phone: "",
        pin: "",
      });
    } catch (error) {
      setStatus(error?.message || "Unable to register store.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <div style={styles.kicker}>SCAN Admin</div>
        <h1 style={styles.title}>Register pilot store</h1>
        <p style={styles.copy}>
          Create or update a store owner login for the cashier app.
        </p>

        <form style={styles.grid} onSubmit={handleSubmit}>
          <input
            placeholder="Store code, e.g. YAS-014"
            style={styles.input}
            value={form.store_code}
            onChange={(event) =>
              updateField("store_code", event.target.value.toUpperCase())
            }
          />
          <input
            placeholder="Store name, e.g. Store #14"
            style={styles.input}
            value={form.store_name}
            onChange={(event) => updateField("store_name", event.target.value)}
          />
          <input
            placeholder="District, e.g. Yasamal"
            style={styles.input}
            value={form.district}
            onChange={(event) => updateField("district", event.target.value)}
          />
          <input
            placeholder="Owner name"
            style={styles.input}
            value={form.owner_name}
            onChange={(event) => updateField("owner_name", event.target.value)}
          />
          <input
            placeholder="Phone"
            style={styles.input}
            value={form.phone}
            onChange={(event) => updateField("phone", event.target.value)}
          />
          <input
            inputMode="numeric"
            maxLength={4}
            placeholder="4-digit PIN"
            style={styles.input}
            type="password"
            value={form.pin}
            onChange={(event) =>
              updateField("pin", event.target.value.replace(/\D/g, ""))
            }
          />

          {status ? <div style={styles.status}>{status}</div> : null}

          <button disabled={isSaving} style={styles.button} type="submit">
            {isSaving ? "Saving store..." : "Activate store"}
          </button>
        </form>
      </section>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    padding: 24,
    background: "#f5f6f8",
    color: "#17191d",
  },
  card: {
    maxWidth: 760,
    margin: "0 auto",
    border: "1px solid rgba(17,17,17,0.08)",
    borderRadius: 18,
    padding: 26,
    background: "#fff",
    boxShadow: "0 22px 54px rgba(17,17,17,0.08)",
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
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
  },
  input: {
    border: "1px solid rgba(17,17,17,0.12)",
    borderRadius: 12,
    padding: "13px 14px",
    fontSize: 16,
  },
  status: {
    gridColumn: "1 / -1",
    borderRadius: 12,
    padding: "11px 12px",
    background: "rgba(230,28,36,0.08)",
    color: PRIMARY_RED,
    fontSize: 14,
    fontWeight: 700,
  },
  button: {
    gridColumn: "1 / -1",
    border: 0,
    borderRadius: 14,
    padding: "14px 16px",
    background: PRIMARY_RED,
    color: "#fff",
    fontWeight: 900,
    letterSpacing: 0.3,
  },
};
