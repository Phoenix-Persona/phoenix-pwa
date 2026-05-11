/**
 * Curated background-music bed options for the video composer.
 *
 * Mirrored from the curator's kind-34011 catalog event:
 *
 *   author hex   : e4ae0200bfdefd7dd5e477d4eea9bda1049d28489243eda210eec9bd63d65f5a
 *   d identifier : zuka-bg-music-v1
 *
 * Each `track` tag has the shape
 *   ["track", url, label, mime, sha256, size]
 *
 * Run `tsx test/manual/video/fetch-music-catalog.ts` to refresh from the
 * latest published version of the event when the curator updates it.
 *
 * The `id` we use is the file's sha256 hash (the Blossom blob
 * identifier) — durable across label edits and stable across catalog
 * republishes, so resuming a chain mid-stitch picks up the same audio
 * even if the curator renames the track.
 *
 * Volume is locked at 0.1 across the board — empirically the right
 * "soft bed under speech" level on consumer playback. Per-track
 * override is supported for tracks that are mastered hot or quiet.
 *
 * TODO(jc): replace this hardcoded mirror with a runtime fetch of the
 * kind-34011 event so the operator's UI updates as the curator pushes
 * new tracks. Easy lift once we have a Nostr query hook in scope on
 * the composer dialog.
 */

export interface MusicTrack {
  /** Stable identifier — persisted on chain records for resume. */
  id: string;
  /** Display label in the composer dropdown. */
  label: string;
  /** Direct mp3 / m4a URL — fetched at stitch time. */
  url: string;
  /**
   * Volume multiplier passed to ffmpeg's `volume` filter. 0.1 is the
   * confirmed sweet spot; tweak per-track only if a track is mastered
   * hot or quiet relative to the others.
   */
  volume?: number;
}

export const DEFAULT_MUSIC_VOLUME = 0.1;

export const BACKGROUND_MUSIC_TRACKS: readonly MusicTrack[] = [
  {
    id: "de848bda1072694387ad580c90d80dc81eac5495552b3f801e829fefb6a5c156",
    label: "Lofi beat",
    url: "https://blossom.ditto.pub/de848bda1072694387ad580c90d80dc81eac5495552b3f801e829fefb6a5c156.mpga",
  },
  {
    id: "e99018fd8c13d5bdc35c6a0a04acf79e41ff978a9b7050680260a5efb91e5095",
    label: "Afrobeat (upbeat)",
    url: "https://blossom.ditto.pub/e99018fd8c13d5bdc35c6a0a04acf79e41ff978a9b7050680260a5efb91e5095.mpga",
  },
  {
    id: "c7fbac01209909116891be48800bad170de8ad6f74117ef1d529a94cee678c9d",
    label: "Afrobeats × lofi",
    url: "https://blossom.ditto.pub/c7fbac01209909116891be48800bad170de8ad6f74117ef1d529a94cee678c9d.mpga",
  },
  {
    id: "9390ed19935cf5f6d69bf8f353ec9c44a36d03d0d3882cbdb9549656310c02ef",
    label: "Soft modern afrobeats",
    url: "https://blossom.ditto.pub/9390ed19935cf5f6d69bf8f353ec9c44a36d03d0d3882cbdb9549656310c02ef.mpga",
  },
  {
    id: "5c46c78f605a6e4bd784fd5ef0c6aae82e01f86437f58769f1fe720acea881c9",
    label: "Blues-style beat",
    url: "https://blossom.ditto.pub/5c46c78f605a6e4bd784fd5ef0c6aae82e01f86437f58769f1fe720acea881c9.mpga",
  },
];

/**
 * Default selection when the user ticks "Add background music".
 * Lofi reads as neutral / news-y under most personas; the others are
 * available as opt-in via the dropdown once we ship it.
 */
export const DEFAULT_MUSIC_TRACK_ID = BACKGROUND_MUSIC_TRACKS[0].id;

export function getMusicTrack(id: string | undefined): MusicTrack | null {
  if (!id) return null;
  return BACKGROUND_MUSIC_TRACKS.find((t) => t.id === id) ?? null;
}
