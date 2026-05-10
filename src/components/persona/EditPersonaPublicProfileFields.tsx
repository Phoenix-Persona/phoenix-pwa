import { PersonaPictureField } from "@/components/PersonaPictureField";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface EditPersonaPublicProfileFieldsProps {
  bio: string;
  pictureUrl: string;
  name: string;
  loadingBio: boolean;
  onBioChange: (value: string) => void;
  onPictureUrlChange: (value: string) => void;
  /**
   * Passed straight through to `PersonaPictureField`. Set to `true` on
   * persona-creation surfaces (where the user hasn't funded a wallet
   * yet) so the picture step falls back to the free Pollinations
   * endpoint instead of dead-ending on PPQ's "no credits" error.
   */
  allowFreeFallback?: boolean;
}

export function EditPersonaPublicProfileFields({
  bio,
  pictureUrl,
  name,
  loadingBio,
  onBioChange,
  onPictureUrlChange,
  allowFreeFallback = false,
}: EditPersonaPublicProfileFieldsProps) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="edit-bio">Bio (public profile)</Label>
        <Textarea
          id="edit-bio"
          rows={2}
          value={bio}
          onChange={(e) => onBioChange(e.target.value)}
          placeholder={loadingBio ? "Loading…" : ""}
        />
      </div>

      <div className="space-y-2">
        <Label>Profile picture</Label>
        <PersonaPictureField
          value={pictureUrl}
          onChange={onPictureUrlChange}
          promptHint={
            name && bio
              ? `Stylized portrait of ${name}: ${bio.slice(0, 80)}`
              : `Stylized portrait of ${name}`
          }
          allowFreeFallback={allowFreeFallback}
        />
      </div>
    </>
  );
}
