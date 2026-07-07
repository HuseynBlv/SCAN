import { useEffect, useState } from "react";
import {
  fetchPersistedBaskets,
  subscribeToBasketChanges,
} from "../services/basketService";

export function useBaskets() {
  const [baskets, setBaskets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadBaskets() {
      try {
        const rows = await fetchPersistedBaskets();
        if (mounted) {
          setBaskets(rows);
          setError("");
        }
      } catch (loadError) {
        if (mounted) {
          setError(loadError?.message || "Unable to load baskets.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadBaskets();
    const unsubscribe = subscribeToBasketChanges(() => {
      void loadBaskets();
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return { baskets, loading, error };
}
