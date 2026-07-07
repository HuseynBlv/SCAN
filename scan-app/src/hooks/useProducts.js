import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";

export function useProducts() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(Boolean(isSupabaseConfigured));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      return undefined;
    }

    let mounted = true;

    async function loadProducts() {
      const { data, error: productError } = await supabase
        .from("products")
        .select("id, barcode, name, brand, category, is_cci_product, image_url, source")
        .order("name", { ascending: true });

      if (!mounted) {
        return;
      }

      if (productError) {
        setError(productError.message);
      } else {
        setProducts(data || []);
        setError("");
      }

      setLoading(false);
    }

    void loadProducts();

    return () => {
      mounted = false;
    };
  }, []);

  return { products, loading, error };
}
