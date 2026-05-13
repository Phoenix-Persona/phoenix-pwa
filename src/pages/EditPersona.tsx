/**
 * EditPersona — modify an existing persona's encrypted backup.
 *
 * Pulls the current envelope via `usePersona`, pre-populates a form
 * with editable fields (name, system_prompt, picture, cross-post),
 * and on save:
 *
 *   1. Builds a new PhoenixEnvelope keeping persona.{pubkey, nsec,
 *      created_at} unchanged (identity invariants).
 *   2. NIP-44 self-encrypts to the user's pubkey.
 *   3. Publishes a kind 30078 with the SAME d-tag as the existing
 *      backup. Addressable replacement handles the upgrade — every
 *      relay that accepts it overwrites the prior revision.
 *   4. If name or bio changed, re-publishes the persona's kind 0
 *      profile via the persona keypair.
 *
 * The form is rendered as a child component keyed by persona pubkey
 * so initial state hydrates once on mount and a different persona
 * re-mounts the form rather than re-using stale state.
 */

import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import type { NostrEvent } from "@nostrify/nostrify";

import { AppHeader } from "@/components/AppHeader";
import { FlagStripe } from "@/components/ImigongoBand";
import { EditPersonaCrossPostFields } from "@/components/persona/EditPersonaCrossPostFields";
import { EditPersonaIdentityFields } from "@/components/persona/EditPersonaIdentityFields";
import { EditPersonaPublicProfileFields } from "@/components/persona/EditPersonaPublicProfileFields";
import { EditPersonaSystemPromptField } from "@/components/persona/EditPersonaSystemPromptField";
import { createPersonaSigner } from "@/lib/personaSigner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { usePageMeta } from "@/hooks/usePageMeta";
import { usePersona } from "@/hooks/usePersona";
import { usePersonaPublicProfile } from "@/hooks/usePersonaPublicProfile";
import { useToast } from "@/hooks/useToast";
import { useUpdatePersona } from "@/hooks/useUpdatePersona";
import { useUsernameAvailability } from "@/hooks/useUsernameAvailability";
import { featureFlags } from "@/lib/features";
import type { PhoenixEnvelope } from "@/lib/persona";
import {
  isValidLightningUsername,
  slugifyForUsername,
} from "@/lib/wallet/lightningAddress";
import { parseCommaList } from "@/lib/text";

const EditPersona = () => {
  const { npub = "" } = useParams();
  usePageMeta({ title: "Edit persona — Zuka" });
  const { user } = useCurrentUser();
  const personaQ = usePersona(npub);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AppHeader />

      <main id="main-content" className="flex-1">
        <section className="relative overflow-hidden hero-mat text-imigongo-cream">
          <div
            className="absolute inset-0 imigongo-pattern-bold text-imigongo-cream opacity-[0.05] pointer-events-none"
            aria-hidden="true"
          />
          <div className="container relative py-10 md:py-14 max-w-3xl space-y-3">
            <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-rw-gold font-semibold">
              <span className="h-px w-6 bg-rw-gold" />
              Edit persona
            </p>
            <h1 className="font-display text-3xl md:text-4xl font-medium tracking-tight">
              {personaQ.data?.envelope.persona.name ?? "Edit"}
            </h1>
            <p className="text-imigongo-cream/80 text-sm max-w-xl">
              Changes to name, prompt, and picture re-encrypt and
              republish to relays. The persona's keypair and creation
              date never change.
            </p>
          </div>
          <FlagStripe height={4} />
        </section>

        <div className="container py-10 max-w-2xl">
          {!user ? (
            <Card className="border-dashed border-imigongo-clay/30">
              <CardContent className="py-12 text-center text-muted-foreground">
                Sign in to edit personas.
              </CardContent>
            </Card>
          ) : personaQ.isLoading ? (
            <Card className="border-imigongo-clay/20">
              <CardContent className="py-12 text-center text-muted-foreground">
                <Loader2 className="size-5 animate-spin mx-auto" />
              </CardContent>
            </Card>
          ) : !personaQ.data ? (
            <Card className="border-dashed border-imigongo-clay/30">
              <CardContent className="py-12 text-center text-muted-foreground space-y-3">
                <p>Persona not found in your account.</p>
                <Button asChild variant="outline" size="sm">
                  <Link to="/my-personas">
                    <ArrowLeft className="mr-2 size-4" />
                    Back to my personas
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <EditPersonaForm
              key={personaQ.data.envelope.persona.pubkey}
              npub={npub}
              backupEvent={personaQ.data.event}
              envelope={personaQ.data.envelope}
            />
          )}
        </div>
      </main>
    </div>
  );
};

interface EditPersonaFormProps {
  npub: string;
  backupEvent: NostrEvent;
  envelope: PhoenixEnvelope;
}

function lightningUsernameFromAddress(address: string | undefined): string | undefined {
  return address?.split("@")[0];
}

function EditPersonaForm({ npub, backupEvent, envelope }: EditPersonaFormProps) {
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const updatePersona = useUpdatePersona();
  const crossPostEnabled = featureFlags.crossPost;

  const original = envelope.persona;

  // Persona signer for the Blossom upload (BUD-01 auth).
  //
  // **Privacy.** The kind 24242 auth event MUST be signed by the persona's
  // keypair, NOT the operator. If we use the operator signer, every
  // Blossom server (and any party that observes its auth events) sees the
  // operator pubkey on every upload — correlating operator ↔ persona.
  //
  // Memoised by persona pubkey: the parent re-mounts on persona change, but
  // we still memoise to be explicit about the dependency.
  const personaSigner = useMemo(() => {
    return createPersonaSigner(original.nsec);
  }, [original.nsec]);

  // Initialize directly from props — the parent passes a `key` of the
  // persona pubkey so a different persona triggers a full remount.
  // `name` is the schema's required display field; we expose it as
  // "Display name" in the UI and keep it in sync with the new
  // `display_name` field on save.
  const [name, setName] = useState(original.display_name ?? original.name);
  const initialUsername =
    original.username ?? slugifyForUsername(original.display_name ?? original.name);
  const [username, setUsername] = useState(initialUsername);
  const [usernameDirty, setUsernameDirty] = useState(false);
  const initialLightningUsername =
    lightningUsernameFromAddress(envelope.wallet?.lightning_address) ??
    initialUsername;
  const [lightningUsername, setLightningUsername] = useState(
    initialLightningUsername,
  );
  const [lightningUsernameDirty, setLightningUsernameDirty] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState(original.system_prompt);
  // The picture initial seed comes from the encrypted backup's
  // reference_image_url; the public kind-0 picture is loaded below
  // and may overwrite if the user changed it elsewhere.
  const [pictureUrl, setPictureUrl] = useState(
    original.reference_image_url ?? ""
  );
  const [pictureHydrated, setPictureHydrated] = useState(false);
  const [originalPicture, setOriginalPicture] = useState(
    original.reference_image_url ?? ""
  );
  const [bio, setBio] = useState("");
  const [bioHydrated, setBioHydrated] = useState(false);
  const [originalBio, setOriginalBio] = useState("");
  // Cross-posting (V1.5 — webhook-to-aggregator default per
  // derek-plan.md "Cross-post + video composer").
  const [webhookUrl, setWebhookUrl] = useState(
    original.cross_post?.webhook_url ?? ""
  );
  const [webhookPlatformsInput, setWebhookPlatformsInput] = useState(
    (original.cross_post?.webhook_platforms ?? []).join(", ")
  );
  const saving = updatePersona.isPending;

  // Live availability check for the Lightning address field. Skip while
  // the value still matches the original (no-op rename).
  const availability = useUsernameAvailability(
    lightningUsername !== initialLightningUsername ? lightningUsername : "",
  );

  function onNameChange(next: string) {
    setName(next);
    const slug = slugifyForUsername(next);
    if (!usernameDirty) {
      setUsername(slug);
    }
    if (!lightningUsernameDirty) {
      setLightningUsername(slug);
    }
  }

  function onUsernameChange(next: string) {
    const cleaned = next.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setUsername(cleaned);
    setUsernameDirty(true);
  }

  function onLightningUsernameChange(next: string) {
    const cleaned = next.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setLightningUsername(cleaned);
    setLightningUsernameDirty(true);
  }

  // Bio + picture come from the persona's public kind 0 — fetched
  // separately because they live on the public profile, not the
  // encrypted backup. Same query yields both fields.
  const profileQuery = usePersonaPublicProfile(original.pubkey);

  // Hydrate inputs once the query resolves. Doing it inside render
  // with a guard avoids a setState-in-effect warning while still
  // keeping the form responsive once the user starts typing.
  if (!bioHydrated && profileQuery.data !== undefined) {
    setBio(profileQuery.data.bio);
    setOriginalBio(profileQuery.data.bio);
    setBioHydrated(true);
  }
  if (!pictureHydrated && profileQuery.data !== undefined) {
    // Prefer the public kind-0 picture if it differs from the
    // encrypted-backup reference image — that's the most recently
    // user-set value.
    const publicPicture = profileQuery.data.picture;
    if (publicPicture) {
      setPictureUrl(publicPicture);
      setOriginalPicture(publicPicture);
    }
    setPictureHydrated(true);
  }

  async function handleSave() {
    if (!user) return;

    // Prefer the d-tag stored inside the encrypted payload (PROJECT.md
    // §5.2). Fall back to the event's own tag for personas authored
    // before persona.dTag landed.
    const dTag =
      original.dTag ?? backupEvent.tags.find(([n]) => n === "d")?.[1];
    if (!dTag) {
      toast({
        title: "Save failed",
        description: "Backup event is missing its d-tag.",
        variant: "destructive",
      });
      return;
    }

    const trimmedUsername = username.trim();
    if (trimmedUsername && !isValidLightningUsername(trimmedUsername)) {
      toast({
        title: "Invalid username",
        description:
          "Usernames must start with a letter or digit and contain only lowercase letters, digits, and hyphens.",
        variant: "destructive",
      });
      return;
    }
    const trimmedLightningUsername = lightningUsername.trim();
    if (
      trimmedLightningUsername &&
      !isValidLightningUsername(trimmedLightningUsername)
    ) {
      toast({
        title: "Invalid Lightning address",
        description:
          "Lightning addresses must start with a letter or digit and contain only lowercase letters, digits, and hyphens.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Cross-post block — only emit if a webhook URL is set, so we
      // don't bloat the encrypted payload with empty fields. Empty
      // string clears the configuration entirely.
      const trimmedWebhook = webhookUrl.trim();
      const webhookPlatforms = parseCommaList(webhookPlatformsInput, []);
      const cross_post = crossPostEnabled
        ? trimmedWebhook
          ? {
              webhook_url: trimmedWebhook,
              ...(webhookPlatforms.length > 0
                ? { webhook_platforms: webhookPlatforms }
                : {}),
            }
          : undefined
        : original.cross_post;

      const result = await updatePersona.mutateAsync({
        backupEvent,
        envelope,
        npub,
        name,
        username: trimmedUsername,
        lightningUsername: trimmedLightningUsername,
        systemPrompt,
        bio,
        originalBio,
        bioHydrated,
        pictureUrl,
        originalPicture,
        pictureHydrated,
        crossPost: cross_post,
      });

      toast({
        title: "Saved",
        description: `${result.updated.name} updated.`,
      });
      navigate(`/dashboard/${npub}`);
    } catch (e) {
      toast({
        title: "Save failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
  }

  return (
    <Card className="border-imigongo-clay/20 overflow-hidden">
      <div className="bg-gradient-to-r from-rw-sky/10 via-rw-gold/10 to-rw-green/10 px-6 py-4 border-b border-imigongo-clay/15">
        <h2 className="font-display text-2xl font-medium tracking-tight">
          Persona details
        </h2>
      </div>
      <CardContent className="space-y-5 pt-5">
        <EditPersonaIdentityFields
          name={name}
          username={username}
          lightningUsername={lightningUsername}
          initialLightningUsername={initialLightningUsername}
          availability={availability}
          onNameChange={onNameChange}
          onUsernameChange={onUsernameChange}
          onLightningUsernameChange={onLightningUsernameChange}
        />

        <EditPersonaPublicProfileFields
          bio={bio}
          pictureUrl={pictureUrl}
          name={name}
          username={username}
          lightningUsername={lightningUsername}
          systemPrompt={systemPrompt}
          loadingBio={profileQuery.isLoading}
          onBioChange={setBio}
          onPictureUrlChange={setPictureUrl}
          pictureSigner={personaSigner}
        />

        <EditPersonaSystemPromptField
          name={name}
          username={username}
          lightningUsername={lightningUsername}
          bio={bio}
          systemPrompt={systemPrompt}
          onSystemPromptChange={setSystemPrompt}
        />

        {crossPostEnabled ? (
          <EditPersonaCrossPostFields
            webhookUrl={webhookUrl}
            webhookPlatformsInput={webhookPlatformsInput}
            onWebhookUrlChange={setWebhookUrl}
            onWebhookPlatformsInputChange={setWebhookPlatformsInput}
          />
        ) : null}

        <div className="flex justify-between gap-2 pt-2">
          <Button asChild variant="ghost" disabled={saving}>
            <Link to={`/dashboard/${npub}`}>
              <ArrowLeft className="mr-2 size-4" />
              Cancel
            </Link>
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="shadow-lg shadow-primary/20"
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save className="mr-2 size-4" />
                Save changes
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default EditPersona;
