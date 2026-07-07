import { useMemo } from "react";
import {
  detectFastBasketSubmission,
  detectLowVariety,
} from "../lib/fraudDetection";

export function useFraudDetection(recentBaskets, currentItems = []) {
  return useMemo(
    () => ({
      tooFast: detectFastBasketSubmission(recentBaskets || []),
      noVariety: detectLowVariety(currentItems),
    }),
    [currentItems, recentBaskets]
  );
}
