export type BaStepUpMode = "off" | "warn" | "enforce";

export function normalizeBaStepUpMode(raw: string | undefined | null): BaStepUpMode {
  const value = raw?.trim().toLowerCase();
  if (!value || value === "off") return "off";
  if (value === "warn") return "warn";
  if (value === "enforce") return "enforce";
  return "enforce";
}

export function isKnownBaStepUpMode(raw: string | undefined | null): boolean {
  const value = raw?.trim().toLowerCase();
  return !value || value === "off" || value === "warn" || value === "enforce";
}

export function resolveBaStepUpMode(): BaStepUpMode {
  return normalizeBaStepUpMode(process.env.BA_STEP_UP_ENFORCEMENT);
}
