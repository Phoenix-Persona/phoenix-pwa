import { AiAssistButton } from "@/components/AiAssistField";
import type { PpqAccountOptions } from "@/hooks/usePpqAccount";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SPARK_LN_DOMAIN } from "@/lib/wallet/lightningAddress";

export interface EditPersonaSystemPromptFieldProps {
  name: string;
  username: string;
  lightningUsername: string;
  bio: string;
  systemPrompt: string;
  ppqAccountOptions?: PpqAccountOptions;
  onSystemPromptChange: (value: string) => void;
}

export function EditPersonaSystemPromptField({
  name,
  username,
  lightningUsername,
  bio,
  systemPrompt,
  ppqAccountOptions,
  onSystemPromptChange,
}: EditPersonaSystemPromptFieldProps) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor="edit-system-prompt">System prompt (private)</Label>
        <AiAssistButton
          fieldLabel="System prompt"
          fieldPurpose="Private instructions that define how the persona should write, what it stands for, and constraints it should follow."
          currentValue={systemPrompt}
          surroundingContext={[
            `Display name: ${fieldContextValue(name)}`,
            `Username: ${fieldContextValue(username)}`,
            `Lightning address: ${
              lightningUsername
                ? `${lightningUsername}@${SPARK_LN_DOMAIN}`
                : "(empty)"
            }`,
            `Current bio: ${fieldContextValue(bio)}`,
          ]}
          onReplace={onSystemPromptChange}
          ppqAccountOptions={ppqAccountOptions}
        />
      </div>
      <Textarea
        id="edit-system-prompt"
        rows={6}
        value={systemPrompt}
        onChange={(e) => onSystemPromptChange(e.target.value)}
      />
    </div>
  );
}

function fieldContextValue(value: string): string {
  return value.trim() || "(empty)";
}
