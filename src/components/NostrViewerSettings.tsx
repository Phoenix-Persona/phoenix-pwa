import { useMemo } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useNostrViewer } from "@/hooks/useNostrViewer";
import {
  buildEventUrl,
  findPresetByUrl,
  NOSTR_VIEWER_PRESETS,
} from "@/lib/nostrViewer";

const CUSTOM_OPTION_VALUE = "__custom__";
const SAMPLE_NEVENT = "nevent1qqsexample…";

export function NostrViewerSettings() {
  const { viewerUrl, setViewerUrl } = useNostrViewer();
  const activePreset = findPresetByUrl(viewerUrl);
  const selectValue = activePreset?.id ?? CUSTOM_OPTION_VALUE;
  const isCustom = !activePreset;

  const previewUrl = useMemo(
    () => buildEventUrl(viewerUrl || "https://example.com/", SAMPLE_NEVENT),
    [viewerUrl],
  );

  function handleSelect(value: string) {
    if (value === CUSTOM_OPTION_VALUE) {
      if (!isCustom) setViewerUrl("");
      return;
    }
    const preset = NOSTR_VIEWER_PRESETS.find((p) => p.id === value);
    if (preset) setViewerUrl(preset.urlPrefix);
  }

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-[200px_1fr] gap-3 sm:items-center">
        <Label htmlFor="nostr-viewer-select" className="text-sm font-medium">
          Open events in
        </Label>
        <Select value={selectValue} onValueChange={handleSelect}>
          <SelectTrigger id="nostr-viewer-select" className="bg-background/60">
            <SelectValue placeholder="Choose a viewer" />
          </SelectTrigger>
          <SelectContent>
            {NOSTR_VIEWER_PRESETS.map((preset) => (
              <SelectItem key={preset.id} value={preset.id}>
                {preset.label}
              </SelectItem>
            ))}
            <SelectItem value={CUSTOM_OPTION_VALUE}>Custom URL…</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isCustom && (
        <div className="grid sm:grid-cols-[200px_1fr] gap-3 sm:items-center">
          <Label htmlFor="nostr-viewer-url" className="text-sm font-medium">
            Custom URL prefix
          </Label>
          <Input
            id="nostr-viewer-url"
            type="url"
            inputMode="url"
            placeholder="https://your-viewer.example/"
            value={viewerUrl}
            onChange={(e) => setViewerUrl(e.target.value)}
            className="bg-background/60"
          />
        </div>
      )}

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Event links in the post footer point here.{" "}
        <span className="font-mono break-all">{previewUrl}</span>
      </p>
    </div>
  );
}
