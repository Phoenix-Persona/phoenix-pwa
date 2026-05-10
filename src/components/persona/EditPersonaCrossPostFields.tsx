import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface EditPersonaCrossPostFieldsProps {
  webhookUrl: string;
  webhookPlatformsInput: string;
  onWebhookUrlChange: (value: string) => void;
  onWebhookPlatformsInputChange: (value: string) => void;
}

export function EditPersonaCrossPostFields({
  webhookUrl,
  webhookPlatformsInput,
  onWebhookUrlChange,
  onWebhookPlatformsInputChange,
}: EditPersonaCrossPostFieldsProps) {
  return (
    <div className="space-y-3 pt-2 border-t border-border">
      <div className="space-y-1">
        <Label htmlFor="edit-cross-post-url">
          Cross-posting webhook (optional)
        </Label>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Paste a webhook URL from your social-media aggregator (Buffer, Zapier,
          Make.com, n8n, etc.). On every persona publish, Zuka POSTs the event
          payload there so the aggregator can fan it out to X / Facebook /
          Instagram / TikTok / wherever you've connected. Leave blank to
          disable.
        </p>
      </div>
      <Input
        id="edit-cross-post-url"
        type="url"
        value={webhookUrl}
        onChange={(e) => onWebhookUrlChange(e.target.value)}
        placeholder="https://hooks.zapier.com/hooks/catch/..."
        autoComplete="off"
      />
      <div className="space-y-1">
        <Label htmlFor="edit-cross-post-platforms" className="text-xs">
          Platforms hint (comma separated, optional)
        </Label>
        <Input
          id="edit-cross-post-platforms"
          value={webhookPlatformsInput}
          onChange={(e) => onWebhookPlatformsInputChange(e.target.value)}
          placeholder="x, facebook, instagram"
        />
        <p className="text-[11px] text-muted-foreground">
          Passed to your webhook as a `platforms` array — your aggregator
          decides what to honor.
        </p>
      </div>
    </div>
  );
}
