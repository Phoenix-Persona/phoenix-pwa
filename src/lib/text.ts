export function parseCommaList(raw: string, fallback: string[]): string[] {
  const parts = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return parts.length > 0 ? parts : fallback;
}
