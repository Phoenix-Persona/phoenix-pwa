/**
 * IndexedDB-backed checkpoint store for the video composer pipeline.
 *
 * The chain is expensive — each Seedance clip costs ~$0.50–$2.50 and
 * takes 2–3 minutes — so we save an in-progress record after every
 * milestone (clip-done, frame-uploaded, stitched, stitched-uploaded,
 * captioned). If the chain crashes (CSP error, transient 502, network
 * blip, or the user closes the tab) the dialog can offer to resume
 * from the latest checkpoint instead of restarting from clip 1.
 *
 * The schema is one object store keyed by a uuid `chainId`. Records
 * carry the full inputs needed to keep going (segments, model, world
 * block, etc.) plus the cumulative artifacts (clip Blobs, frame URLs,
 * stitched Blob/URL, caption draft).
 *
 * Blobs are written directly — IndexedDB supports them natively, no
 * base64 round-trip needed. A successful publish or explicit dismiss
 * deletes the record.
 */

import { vlog, vwarn } from "./log";
import type { ScriptSegment } from "./generateMonologueScript";

const DB_NAME = "phoenix-video-chain";
const DB_VERSION = 1;
const STORE = "chains";

export interface StoredClip {
  id: string;
  url: string;
  costUsd?: number;
  blob: Blob;
}

export interface ChainInputs {
  idea: string;
  hints?: string;
  sources?: string[];
  totalDurationSecs: number;
  segmentSecs: number;
  model: string;
  aspect: "9:16" | "16:9" | "1:1";
  quality: string;
  worldBlock: string;
  /** Persona npub-equivalent (pubkey hex) so we don't cross-pollinate personas. */
  personaPubkey: string;
  personaName: string;
  /** Ppq.ai signed preview URL — display-only; may have expired by resume time. */
  previewUrl?: string;
  /** Blossom-permanent seed for clip 1. */
  seedImageUrl?: string;
}

export interface ChainRecord {
  chainId: string;
  createdAt: number;
  updatedAt: number;
  inputs: ChainInputs;
  segments?: ScriptSegment[];
  clips: StoredClip[];
  /** Uploaded frame URL to feed into the *next* (clips.length-th) clip. */
  nextImageUrl?: string;
  stitchedBlob?: Blob;
  stitchedUrl?: string;
  captionDraft?: string;
}

/** Returned to the dialog so it can describe how far the chain got. */
export interface ChainSummary {
  chainId: string;
  updatedAt: number;
  personaName: string;
  personaPubkey: string;
  idea: string;
  totalSegments: number;
  completedClips: number;
  hasStitched: boolean;
  hasStitchedUrl: boolean;
  hasCaption: boolean;
}

/* ---------- low-level IDB helpers ---------- */

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable in this environment"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "chainId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IDB open failed"));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      const req = fn(store);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("IDB op failed"));
    });
  } finally {
    db.close();
  }
}

/* ---------- public API ---------- */

export function newChainId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `chain-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function saveChain(record: ChainRecord): Promise<void> {
  try {
    record.updatedAt = Date.now();
    await withStore("readwrite", (s) => s.put(record));
    vlog("chainStore", `saved ${record.chainId}`, {
      clips: record.clips.length,
      hasStitched: Boolean(record.stitchedBlob),
      stitchedUrl: record.stitchedUrl,
      hasCaption: Boolean(record.captionDraft),
    });
  } catch (err) {
    vwarn("chainStore", "saveChain failed (non-fatal):", err);
  }
}

export async function loadChain(chainId: string): Promise<ChainRecord | null> {
  try {
    const result = await withStore<ChainRecord | undefined>(
      "readonly",
      (s) => s.get(chainId) as IDBRequest<ChainRecord | undefined>,
    );
    return result ?? null;
  } catch (err) {
    vwarn("chainStore", `loadChain(${chainId}) failed:`, err);
    return null;
  }
}

export async function deleteChain(chainId: string): Promise<void> {
  try {
    await withStore("readwrite", (s) => s.delete(chainId));
    vlog("chainStore", `deleted ${chainId}`);
  } catch (err) {
    vwarn("chainStore", `deleteChain(${chainId}) failed (non-fatal):`, err);
  }
}

export async function listChains(): Promise<ChainSummary[]> {
  try {
    const all = await withStore<ChainRecord[]>(
      "readonly",
      (s) => s.getAll() as IDBRequest<ChainRecord[]>,
    );
    return all
      .map<ChainSummary>((r) => ({
        chainId: r.chainId,
        updatedAt: r.updatedAt,
        personaName: r.inputs.personaName,
        personaPubkey: r.inputs.personaPubkey,
        idea: r.inputs.idea,
        totalSegments: r.segments?.length ?? 0,
        completedClips: r.clips.length,
        hasStitched: Boolean(r.stitchedBlob),
        hasStitchedUrl: Boolean(r.stitchedUrl),
        hasCaption: Boolean(r.captionDraft),
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (err) {
    vwarn("chainStore", "listChains failed:", err);
    return [];
  }
}

export async function findResumableForPersona(
  personaPubkey: string,
): Promise<ChainSummary | null> {
  const all = await listChains();
  return all.find((c) => c.personaPubkey === personaPubkey) ?? null;
}
