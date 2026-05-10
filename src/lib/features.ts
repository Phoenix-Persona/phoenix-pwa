import { readEnv } from "./env";

export type FeatureFlagName = "crossPost";

export interface FeatureFlags {
  crossPost: boolean;
}

export function parseFeatureFlag(
  value: string | undefined,
  fallback = false,
): boolean {
  if (value === undefined) return fallback;
  switch (value.trim().toLowerCase()) {
    case "1":
    case "true":
    case "yes":
    case "on":
      return true;
    case "0":
    case "false":
    case "no":
    case "off":
      return false;
    default:
      return fallback;
  }
}

export function readFeatureFlag(envName: string, fallback = false): boolean {
  return parseFeatureFlag(readEnv(envName), fallback);
}

export const featureFlags: FeatureFlags = {
  crossPost: readFeatureFlag("VITE_FEATURE_CROSS_POST"),
};

export function isFeatureEnabled(name: FeatureFlagName): boolean {
  return featureFlags[name];
}
