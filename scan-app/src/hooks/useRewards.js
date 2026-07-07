import { useMemo } from "react";
import { createRewardsSnapshot } from "../services/rewards";

export function useRewards(baskets, storeName) {
  return useMemo(
    () => createRewardsSnapshot(baskets || [], storeName),
    [baskets, storeName]
  );
}
