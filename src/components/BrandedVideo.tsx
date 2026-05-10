/**
 * Branded video player — replaces the browser's default <video> chrome
 * with a Phoenix-themed control surface (rw-gold scrubber, charcoal
 * canvas, white-on-black icon row).
 *
 * The native `<video>` element is still doing all the heavy lifting
 * (decode, paint, seek). We just hide its built-in controls and
 * render our own overlays on top, wired to the element's events.
 *
 * Mobile-aware:
 *   - Tap on the video toggles control visibility (matches platform
 *     muscle memory).
 *   - Touch targets are >= 36px on mobile, smaller on desktop where
 *     pointer accuracy is higher.
 *   - Scrubber is taller on mobile so it's easy to grab.
 *
 * Auto-hide during playback after ~2.5s of inactivity; always visible
 * when paused. A pointer-move (or touch) inside the container resets
 * the timer.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  Download,
  Maximize2,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react";

import { downloadFile } from "@/lib/downloadFile";
import { cn } from "@/lib/utils";

export interface BrandedVideoProps {
  src: string;
  poster?: string;
  alt?: string;
  /** Additional classes for the outer wrapper. */
  className?: string;
  /** CSS aspect-ratio override (defaults to letting the video set its own). */
  aspectRatio?: string;
  /** Cap the rendered height — useful inside scrollable feeds. */
  maxHeightClass?: string;
}

const HIDE_DELAY_MS = 2500;

export function BrandedVideo(props: BrandedVideoProps) {
  const {
    src,
    poster,
    alt,
    className,
    aspectRatio,
    maxHeightClass = "max-h-[28rem]",
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hideTimerRef = useRef<number | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [hasInteracted, setHasInteracted] = useState(false);

  /* ---------- controls auto-hide ----------
   *
   * The show/hide is driven by the same events that flip `isPlaying`,
   * not by a state-derived effect — keeps the visibility transitions
   * coupled to the underlying media events instead of cascading
   * renders.
   */

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const armHide = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      setShowControls(false);
    }, HIDE_DELAY_MS);
  }, [clearHideTimer]);

  // Wake the control bar on any pointer movement / touch in the
  // container; if the video is currently playing, re-arm the hide timer.
  const wakeControls = useCallback(() => {
    setShowControls(true);
    if (videoRef.current && !videoRef.current.paused) armHide();
    else clearHideTimer();
  }, [armHide, clearHideTimer]);

  /* ---------- video element ↔ react state sync ---------- */

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => {
      setIsPlaying(true);
      armHide();
    };
    const onPause = () => {
      setIsPlaying(false);
      setShowControls(true);
      clearHideTimer();
    };
    const onTime = () => setCurrentTime(v.currentTime);
    const onMeta = () => {
      if (Number.isFinite(v.duration)) setDuration(v.duration);
    };
    const onVolume = () => setMuted(v.muted);
    const onEnded = () => {
      setIsPlaying(false);
      setShowControls(true);
      clearHideTimer();
    };
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("durationchange", onMeta);
    v.addEventListener("volumechange", onVolume);
    v.addEventListener("ended", onEnded);
    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("durationchange", onMeta);
      v.removeEventListener("volumechange", onVolume);
      v.removeEventListener("ended", onEnded);
      clearHideTimer();
    };
  }, [armHide, clearHideTimer]);

  /* ---------- actions ---------- */

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setHasInteracted(true);
    if (v.paused) {
      void v.play();
    } else {
      v.pause();
    }
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
  }, []);

  const seekTo = useCallback((ratio: number) => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration)) return;
    v.currentTime = Math.max(0, Math.min(v.duration, ratio * v.duration));
  }, []);

  const toggleFullscreen = useCallback(() => {
    const v = videoRef.current;
    const c = containerRef.current;
    if (!v || !c) return;
    type FsElement = HTMLElement & {
      webkitRequestFullscreen?: () => void;
      webkitEnterFullscreen?: () => void;
    };
    type FsDoc = Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => void;
    };
    const fsDoc = document as FsDoc;
    const fsContainer = c as FsElement;
    const fsVideo = v as FsElement;
    const isFs =
      Boolean(document.fullscreenElement) ||
      Boolean(fsDoc.webkitFullscreenElement);
    if (isFs) {
      if (document.exitFullscreen) void document.exitFullscreen();
      else fsDoc.webkitExitFullscreen?.();
      return;
    }
    if (fsContainer.requestFullscreen) {
      void fsContainer.requestFullscreen();
    } else if (fsContainer.webkitRequestFullscreen) {
      fsContainer.webkitRequestFullscreen();
    } else if (fsVideo.webkitEnterFullscreen) {
      // iOS Safari can fullscreen the video element only.
      fsVideo.webkitEnterFullscreen();
    }
  }, []);

  /* ---------- progress bar interaction ---------- */

  const onScrubPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const bar = e.currentTarget;
      bar.setPointerCapture(e.pointerId);
      const apply = (clientX: number) => {
        const rect = bar.getBoundingClientRect();
        const ratio = (clientX - rect.left) / Math.max(1, rect.width);
        seekTo(Math.max(0, Math.min(1, ratio)));
      };
      apply(e.clientX);
      const onMove = (ev: PointerEvent) => apply(ev.clientX);
      const onUp = () => {
        bar.removeEventListener("pointermove", onMove);
        bar.removeEventListener("pointerup", onUp);
        bar.removeEventListener("pointercancel", onUp);
      };
      bar.addEventListener("pointermove", onMove);
      bar.addEventListener("pointerup", onUp);
      bar.addEventListener("pointercancel", onUp);
    },
    [seekTo],
  );

  /* ---------- render ---------- */

  const ratio =
    duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  const wrapperStyle: CSSProperties | undefined = aspectRatio
    ? { aspectRatio }
    : undefined;

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative group/player rounded-lg overflow-hidden bg-imigongo-charcoal",
        "ring-1 ring-imigongo-clay/20",
        className,
      )}
      style={wrapperStyle}
      onPointerMove={wakeControls}
      onPointerDown={wakeControls}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        preload="metadata"
        playsInline
        crossOrigin="anonymous"
        muted={muted}
        aria-label={alt}
        // Let the video element drive its own height from its intrinsic
        // aspect ratio (h-auto), capped by `maxHeightClass`. The
        // wrapper then sizes to the rendered video — overlays absolute-
        // position correctly without a circular height resolution
        // between wrapper and `h-full` video. `object-contain` keeps
        // the frame letterboxed inside the element if the cap kicks in.
        className={cn(
          "w-full h-auto block object-contain mx-auto",
          maxHeightClass,
        )}
        onClick={togglePlay}
      />

      {/* Center play overlay — visible until first interaction starts playback. */}
      {!isPlaying && !hasInteracted && (
        <button
          type="button"
          onClick={togglePlay}
          aria-label="Play video"
          className={cn(
            "absolute inset-0 flex items-center justify-center",
            "bg-black/10 transition-colors hover:bg-black/20",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rw-gold",
          )}
        >
          <span
            className={cn(
              "grid place-items-center rounded-full",
              "size-14 sm:size-20",
              "bg-rw-gold/95 shadow-2xl ring-4 ring-white/15",
              "transition-transform duration-150 group-hover/player:scale-105",
            )}
          >
            <Play
              className="size-6 sm:size-8 text-imigongo-charcoal fill-imigongo-charcoal translate-x-0.5"
              aria-hidden="true"
            />
          </span>
        </button>
      )}

      {/* Bottom control bar */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0",
          "px-3 pt-6 pb-2 sm:px-4 sm:pb-3",
          "bg-gradient-to-t from-black/85 via-black/55 to-transparent",
          "transition-opacity duration-200",
          showControls ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
      >
        {/* Progress bar */}
        <div
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.max(1, Math.round(duration))}
          aria-valuenow={Math.round(currentTime)}
          tabIndex={0}
          onPointerDown={onScrubPointerDown}
          onKeyDown={(e) => {
            const v = videoRef.current;
            if (!v) return;
            if (e.key === "ArrowRight") {
              v.currentTime = Math.min(v.duration, v.currentTime + 5);
              e.preventDefault();
            } else if (e.key === "ArrowLeft") {
              v.currentTime = Math.max(0, v.currentTime - 5);
              e.preventDefault();
            }
          }}
          className={cn(
            "group/scrub relative cursor-pointer rounded-full bg-white/20",
            "h-1.5 sm:h-1 sm:hover:h-1.5 transition-[height]",
            "mb-2 sm:mb-2.5",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rw-gold focus-visible:ring-offset-2 focus-visible:ring-offset-imigongo-charcoal",
          )}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-rw-gold"
            style={{ width: `${ratio}%` }}
          />
          <div
            className={cn(
              "absolute top-1/2 -translate-y-1/2 -translate-x-1/2",
              "size-3 sm:size-2.5 rounded-full bg-rw-gold shadow",
              "opacity-0 group-hover/scrub:opacity-100 group-focus-visible/scrub:opacity-100 transition-opacity",
            )}
            style={{ left: `${ratio}%` }}
          />
        </div>

        {/* Buttons row */}
        <div className="flex items-center gap-1 text-white">
          <ControlButton
            onClick={togglePlay}
            label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <Pause className="size-4 fill-current" aria-hidden="true" />
            ) : (
              <Play
                className="size-4 fill-current translate-x-0.5"
                aria-hidden="true"
              />
            )}
          </ControlButton>

          <span className="text-[11px] sm:text-xs tabular-nums px-1 select-none">
            {formatTime(currentTime)}
            <span className="text-white/60"> / {formatTime(duration)}</span>
          </span>

          <div className="flex-1" />

          <ControlButton
            onClick={toggleMute}
            label={muted ? "Unmute" : "Mute"}
          >
            {muted ? (
              <VolumeX className="size-4" aria-hidden="true" />
            ) : (
              <Volume2 className="size-4" aria-hidden="true" />
            )}
          </ControlButton>

          <ControlButton
            onClick={() => void downloadFile(src)}
            label="Download"
          >
            <Download className="size-4" aria-hidden="true" />
          </ControlButton>

          <ControlButton onClick={toggleFullscreen} label="Fullscreen">
            <Maximize2 className="size-4" aria-hidden="true" />
          </ControlButton>
        </div>
      </div>
    </div>
  );
}

function ControlButton(props: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-label={props.label}
      title={props.label}
      className={cn(
        "size-9 sm:size-8 grid place-items-center rounded-md",
        "text-white/95 hover:text-rw-gold hover:bg-white/10",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rw-gold",
        "transition-colors",
      )}
    >
      {props.children}
    </button>
  );
}

function formatTime(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) return "0:00";
  const total = Math.round(secs);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
