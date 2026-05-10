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
}

export function EditPersonaPublicProfileFields({
  bio,
  pictureUrl,
  name,
  loadingBio,
  onBioChange,
  onPictureUrlChange,
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
        />
      </div>
    </>
  );
}
