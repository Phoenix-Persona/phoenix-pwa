/**
 * EditPersona — modify an existing persona's encrypted backup.
 *
 * Pulls the current envelope via `usePersona`, pre-populates a form
 * with editable fields (name, system_prompt, voice_id, languages,
 * tags), and on save:
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

import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useSeoMeta } from "@unhead/react";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { useNostr } from "@nostrify/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NostrEvent } from "@nostrify/nostrify";
import { nip19 } from "nostr-tools";

import { AppHeader } from "@/components/AppHeader";
import { FlagStripe } from "@/components/ImigongoBand";
import { PersonaPictureField } from "@/components/PersonaPictureField";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { usePersona } from "@/hooks/usePersona";
import { useToast } from "@/hooks/useToast";
import {
  buildEncryptedPersonaTemplate,
  type Persona,
  type PhoenixEnvelope,
} from "@/lib/persona";
import {
  encryptPhoenixEnvelope,
  type Nip44Signer,
} from "@/lib/personaCrypto";

const EditPersona = () => {
  const { npub = "" } = useParams();
  useSeoMeta({ title: "Edit persona — Feniksi" });
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
              Changes to name, prompt, voice, languages, and tags
              re-encrypt and republish to relays. The persona's keypair
              and creation date never change.
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

function EditPersonaForm({ npub, backupEvent, envelope }: EditPersonaFormProps) {
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const original = envelope.persona;

  // Initialize directly from props — the parent passes a `key` of the
  // persona pubkey so a different persona triggers a full remount.
  const [name, setName] = useState(original.name);
  const [systemPrompt, setSystemPrompt] = useState(original.system_prompt);
  const [voiceId, setVoiceId] = useState(original.voice_id);
  const [tagsInput, setTagsInput] = useState(original.tags.join(", "));
  const [languagesInput, setLanguagesInput] = useState(
    original.languages.join(", ")
  );
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
  const [saving, setSaving] = useState(false);

  // Bio + picture come from the persona's public kind 0 — fetched
  // separately because they live on the public profile, not the
  // encrypted backup. Same query yields both fields.
  interface PublicProfile {
    bio: string;
    picture: string;
  }
  const profileQuery = useQuery({
    queryKey: ["persona-public-profile", original.pubkey],
    queryFn: async (c): Promise<PublicProfile> => {
      const events = await nostr.query(
        [{ kinds: [0], authors: [original.pubkey], limit: 1 }],
        { signal: c.signal }
      );
      const ev = events[0];
      if (!ev) return { bio: "", picture: "" };
      try {
        const meta = JSON.parse(ev.content) as {
          about?: string;
          picture?: string;
        };
        return { bio: meta.about ?? "", picture: meta.picture ?? "" };
      } catch {
        return { bio: "", picture: "" };
      }
    },
  });

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

    const dTag = backupEvent.tags.find(([n]) => n === "d")?.[1];
    if (!dTag) {
      toast({
        title: "Save failed",
        description: "Backup event is missing its d-tag.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      // Build the updated persona — identity fields are immutable.
      const updated: Persona = {
        ...original,
        name: name.trim() || original.name,
        system_prompt: systemPrompt,
        voice_id: voiceId.trim() || original.voice_id,
        languages: parseList(languagesInput, original.languages),
        tags: parseList(tagsInput, []),
        reference_image_url: pictureUrl || undefined,
      };

      const signer = user.signer as unknown as Nip44Signer;

      const ciphertext = await encryptPhoenixEnvelope(
        {
          persona: updated,
          wallet: envelope.wallet,
          model_prefs: envelope.model_prefs,
          settings: envelope.settings,
        },
        user.pubkey,
        signer
      );

      const tmpl = buildEncryptedPersonaTemplate({
        dTag,
        encryptedContent: ciphertext,
      });
      const signed = await user.signer.signEvent(tmpl);
      await nostr.event(signed, { signal: AbortSignal.timeout(8000) });

      // If the public-facing name, bio, or picture changed,
      // re-publish kind 0 signed by the persona keypair.
      const nameChanged = updated.name !== original.name;
      const bioChanged = bioHydrated && bio !== originalBio;
      const pictureChanged = pictureHydrated && pictureUrl !== originalPicture;
      if (nameChanged || bioChanged || pictureChanged) {
        try {
          const decoded = nip19.decode(updated.nsec);
          if (decoded.type !== "nsec") throw new Error("Bad nsec");
          const { finalizeEvent } = await import("nostr-tools/pure");
          const kind0Content: Record<string, unknown> = {
            name: updated.name,
            display_name: updated.name,
            about: bio,
            picture: pictureUrl || "",
            bot: true,
          };
          if (pictureUrl) {
            kind0Content.phoenix = {
              reference_image: pictureUrl,
              version: 1,
            };
          }
          const profileTemplate = {
            kind: 0,
            created_at: Math.floor(Date.now() / 1000),
            tags: [],
            content: JSON.stringify(kind0Content),
          };
          const profileEvent = finalizeEvent(profileTemplate, decoded.data);
          await nostr.event(profileEvent, {
            signal: AbortSignal.timeout(8000),
          });
        } catch (e) {
          // Profile update is best-effort — the encrypted backup is
          // already saved at this point.
          console.warn("Failed to update persona profile:", e);
        }
      }

      queryClient.invalidateQueries({ queryKey: ["phoenix-persona"] });
      queryClient.invalidateQueries({ queryKey: ["phoenix-my-personas"] });
      queryClient.invalidateQueries({ queryKey: ["nostr", "author"] });
      queryClient.invalidateQueries({
        queryKey: ["persona-public-profile"],
      });

      toast({
        title: "Saved",
        description: `${updated.name} updated.`,
      });
      navigate(`/dashboard/${npub}`);
    } catch (e) {
      toast({
        title: "Save failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
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
        <div className="space-y-2">
          <Label htmlFor="edit-name">Name</Label>
          <Input
            id="edit-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit-bio">Bio (public profile)</Label>
          <Textarea
            id="edit-bio"
            rows={2}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder={profileQuery.isLoading ? "Loading…" : ""}
          />
        </div>

        <div className="space-y-2">
          <Label>Profile picture</Label>
          <PersonaPictureField
            value={pictureUrl}
            onChange={setPictureUrl}
            promptHint={
              name && bio
                ? `Stylized portrait of ${name}: ${bio.slice(0, 80)}`
                : `Stylized portrait of ${name}`
            }
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit-system-prompt">
            System prompt (private)
          </Label>
          <Textarea
            id="edit-system-prompt"
            rows={6}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="edit-tags">Topical tags</Label>
            <Input
              id="edit-tags"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="rwanda, press-freedom"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-languages">Languages</Label>
            <Input
              id="edit-languages"
              value={languagesInput}
              onChange={(e) => setLanguagesInput(e.target.value)}
              placeholder="en, rw"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit-voice">Voice</Label>
          <Input
            id="edit-voice"
            value={voiceId}
            onChange={(e) => setVoiceId(e.target.value)}
            placeholder="alloy"
          />
        </div>

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

function parseList(raw: string, fallback: string[]): string[] {
  const parts = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return parts.length > 0 ? parts : fallback;
}

export default EditPersona;
