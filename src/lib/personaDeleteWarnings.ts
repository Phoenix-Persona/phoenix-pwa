import type { DeletePersonaWarning } from "@/hooks/useDeletePersona";

const DELETE_WARNING_LABELS: Record<DeletePersonaWarning, string> = {
  "backup-decrypt": "backup decrypt",
  "lightning-address-release": "Lightning Address release",
  "kind0-lookup": "public profile deletion lookup",
};

function joinLabels(labels: string[]): string {
  if (labels.length === 1) return labels[0] ?? "";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}

export function formatDeletePersonaWarnings(
  warnings: DeletePersonaWarning[],
): string | undefined {
  if (warnings.length === 0) return undefined;
  const labels = warnings.map((warning) => DELETE_WARNING_LABELS[warning]);
  if (labels.length === 1) {
    return `Deleted, but the ${labels[0]} could not be confirmed.`;
  }
  return `Deleted, but ${joinLabels(labels)} cleanup could not be confirmed.`;
}
