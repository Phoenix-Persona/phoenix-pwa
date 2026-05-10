import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { UsernameAvailabilityState } from "@/hooks/useUsernameAvailability";
import { SPARK_LN_DOMAIN } from "@/lib/wallet/lightningAddress";

export interface EditPersonaIdentityFieldsProps {
  name: string;
  username: string;
  lightningUsername: string;
  initialLightningUsername: string;
  availability: UsernameAvailabilityState;
  onNameChange: (value: string) => void;
  onUsernameChange: (value: string) => void;
  onLightningUsernameChange: (value: string) => void;
}

export function EditPersonaIdentityFields({
  name,
  username,
  lightningUsername,
  initialLightningUsername,
  availability,
  onNameChange,
  onUsernameChange,
  onLightningUsernameChange,
}: EditPersonaIdentityFieldsProps) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="edit-name">Display name</Label>
        <Input
          id="edit-name"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Shown in posts and on the persona's public profile.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="edit-username">Username</Label>
        <Input
          id="edit-username"
          value={username}
          onChange={(e) => onUsernameChange(e.target.value)}
          placeholder="username"
          className="font-mono text-sm"
          autoComplete="off"
          spellCheck={false}
        />
        <p className="text-xs text-muted-foreground">
          Public handle for the persona profile.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="edit-lightning-username">Lightning address</Label>
        <div className="flex items-center gap-1.5">
          <Input
            id="edit-lightning-username"
            value={lightningUsername}
            onChange={(e) => onLightningUsernameChange(e.target.value)}
            placeholder="username"
            className="font-mono text-sm"
            autoComplete="off"
            spellCheck={false}
          />
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            @{SPARK_LN_DOMAIN}
          </span>
        </div>
        <UsernameAvailabilityHint
          state={availability}
          originalUsername={initialLightningUsername}
          currentUsername={lightningUsername}
        />
      </div>
    </>
  );
}

function UsernameAvailabilityHint({
  state,
  originalUsername,
  currentUsername,
}: {
  state: UsernameAvailabilityState;
  originalUsername: string;
  currentUsername: string;
}) {
  if (currentUsername === originalUsername) {
    return (
      <p className="text-xs text-muted-foreground">
        Current Lightning Address. Edit to claim a different one — Spark
        replaces the old registration on rename.
      </p>
    );
  }
  switch (state.status) {
    case "idle":
      return null;
    case "invalid":
      return (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          Lowercase letters, digits, and hyphens only — must start with a letter
          or digit.
        </p>
      );
    case "checking":
      return (
        <p className="text-xs text-muted-foreground">
          Checking{" "}
          <code className="font-mono">
            {state.username}@{SPARK_LN_DOMAIN}
          </code>
          …
        </p>
      );
    case "available":
      return (
        <p className="text-xs text-emerald-600 dark:text-emerald-500">
          <code className="font-mono">
            {state.username}@{SPARK_LN_DOMAIN}
          </code>{" "}
          is available.
        </p>
      );
    case "taken":
      return (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          <code className="font-mono">
            {state.username}@{SPARK_LN_DOMAIN}
          </code>{" "}
          is taken — pick a different Lightning address before saving.
        </p>
      );
    case "error":
      return (
        <p className="text-xs text-muted-foreground">
          Couldn't reach the LNURL host — registration will run anyway.
        </p>
      );
  }
}
