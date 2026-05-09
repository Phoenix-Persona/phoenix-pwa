/**
 * Client for the Phoenix /style endpoint owned by Jim.
 *
 * Contract:
 *   POST /api/style
 *   request:  { text: string, persona: PersonaConfig }
 *   response: { styled: string, sources?: string[], tokensUsed?: number }
 *
 * Errors: non-2xx responses surface a `StyleError` with the message body.
 *
 * The endpoint base URL is configurable via VITE_PHOENIX_API_BASE.
 * Defaults to "/api" so it works seamlessly when colocated with the frontend
 * (Vercel functions deployed alongside the PWA).
 */

import type { PersonaConfig } from "./persona";

/**
 * Subset of PersonaConfig safe to send over the wire — explicitly excludes
 * the persona nsec so we never leak secrets to the styling endpoint.
 */
export type PersonaStylingPayload = Omit<PersonaConfig, "personaNsec">;

export function toStylingPayload(config: PersonaConfig): PersonaStylingPayload {
  const { personaNsec: _omit, ...safe } = config;
  void _omit;
  return safe;
}

export interface StyleRequest {
  text: string;
  persona: PersonaStylingPayload;
}

export interface StyleResponse {
  styled: string;
  sources?: string[];
  tokensUsed?: number;
}

export class StyleError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "StyleError";
  }
}

const API_BASE: string =
  (import.meta.env.VITE_PHOENIX_API_BASE as string | undefined) ?? "/api";

export async function styleText(req: StyleRequest, signal?: AbortSignal): Promise<StyleResponse> {
  const res = await fetch(`${API_BASE}/style`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new StyleError(body || `Style request failed (${res.status})`, res.status);
  }

  const data = (await res.json()) as StyleResponse;
  if (typeof data.styled !== "string") {
    throw new StyleError("Malformed styling response", 502);
  }
  return data;
}

/**
 * V2 brainstorm endpoint stub — same module so the dashboard can wire it
 * later. Returns an array of candidate posts.
 */
export interface BrainstormResponse {
  candidates: Array<{ text: string; sources: string[] }>;
}

export async function brainstormPosts(
  persona: PersonaStylingPayload,
  signal?: AbortSignal
): Promise<BrainstormResponse> {
  const res = await fetch(`${API_BASE}/brainstorm`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ persona }),
    signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new StyleError(body || `Brainstorm failed (${res.status})`, res.status);
  }
  return (await res.json()) as BrainstormResponse;
}
