/**
 * Onboard — Phoenix character-creator wizard.
 *
 * Phase 1 status: STUB. The full agent-driven wizard (PROJECT.md §6,
 * tasks/derek-plan.md Phase 2) wires `pi-agent-core` + `pi-web-ui` +
 * Jim's PPQ hooks. Until those land we ship a minimal "create blank
 * persona" form so the rest of the multi-persona flow is exercisable.
 *
 * The blank-persona path generates a fresh keypair and an empty
 * envelope. There is no agent, no image, no voice yet — those land
 * in Phase 2 (CharacterCreator.tsx).
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSeoMeta } from "@unhead/react";
import { Loader2 } from "lucide-react";
import { useNostr } from "@nostrify/react";

import { PhoenixHeader } from "@/components/PhoenixHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/useToast";
import { useCurrentUser } from "@/hooks/useCurrentUser";

import {
  buildEncryptedPersonaTemplate,
  DEFAULT_MODEL_PREFS,
  generatePersonaDTag,
  type Persona,
} from "@/lib/persona";
import {
  encryptPhoenixEnvelope,
  type Nip44Signer,
} from "@/lib/personaCrypto";
import {
  generatePersonaKeypair,
  signWithPersona,
} from "@/lib/personaKey";

const Onboard = () => {
  useSeoMeta({ title: "Create a persona — Phoenix" });
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { toast } = useToast();

  const [name, setName] = useState("Voice of Rwanda");
  const [bio, setBio] = useState(
    "An AI-assisted voice. Press freedom, civil society, the long memory."
  );
  const [systemPrompt, setSystemPrompt] = useState(
    "You are an AI-assisted activist voice. Write with precision. Avoid sensationalism. Ground every claim in cited sources. Speak truth without dehumanizing anyone."
  );
  const [tagsInput, setTagsInput] = useState("rwanda, press-freedom");
  const [languagesInput, setLanguagesInput] = useState("en, rw");
  const [voiceId, setVoiceId] = useState("alloy");
  const [publishing, setPublishing] = useState(false);

  async function publishPersona() {
    if (!user) {
      toast({
        title: "Sign in first",
        description: "You need a Nostr signer to create a persona.",
        variant: "destructive",
      });
      return;
    }
    setPublishing(true);
    try {
      const kp = generatePersonaKeypair();
      const persona: Persona = {
        pubkey: kp.hex.pk,
        nsec: kp.nsec,
        name: name.trim() || "Untitled",
        system_prompt: systemPrompt,
        voice_id: voiceId,
        languages: parseList(languagesInput, ["en"]),
        tags: parseList(tagsInput, []),
        created_at: Math.floor(Date.now() / 1000),
      };

      const signer = user.signer as unknown as Nip44Signer;

      // 1. Encrypt the Phoenix envelope (user self-encryption).
      const ciphertext = await encryptPhoenixEnvelope(
        {
          persona,
          model_prefs: DEFAULT_MODEL_PREFS,
        },
        user.pubkey,
        signer
      );

      // 2. Build + sign with a random UUID d-tag — no identifying tags.
      const personaTemplate = buildEncryptedPersonaTemplate({
        dTag: generatePersonaDTag(),
        encryptedContent: ciphertext,
      });
      const signed = await user.signer.signEvent(personaTemplate);
      await nostr.event(signed, { signal: AbortSignal.timeout(8000) });

      // 3. Publish a public kind 0 profile so the persona's feed is
      //    browsable from any Nostr client.
      const profileEvent = signWithPersona(
        {
          kind: 0,
          created_at: Math.floor(Date.now() / 1000),
          tags: [],
          content: JSON.stringify({
            name: persona.name,
            display_name: persona.name,
            about: bio,
            picture: "",
            bot: true,
          }),
        },
        kp
      );
      await nostr.event(profileEvent, { signal: AbortSignal.timeout(8000) });

      toast({
        title: "Persona published",
        description: `${persona.name} is live and private to you.`,
      });
      navigate(`/dashboard/${kp.npub}`);
    } catch (e) {
      toast({
        title: "Publish failed",
        description:
          e instanceof Error
            ? e.message
            : "Could not publish persona event to relays.",
        variant: "destructive",
      });
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <PhoenixHeader />

      <main
        id="main-content"
        className="flex-1 container py-10 max-w-2xl space-y-6"
      >
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.18em] text-imigongo-clay font-semibold">
            Phase 1 stub
          </p>
          <h1 className="font-display text-4xl md:text-5xl font-medium tracking-tight">
            Create a persona
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            The agent-driven wizard with image generation and voice
            sampling lands in Phase 2. For now, this is a minimal form
            so we can exercise the multi-persona, encrypted-backup, and
            publish flows end-to-end.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-2xl font-medium">
              New persona
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="persona-name">Name</Label>
              <Input
                id="persona-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Voice of Rwanda"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="persona-bio">
                Bio (public, lives on the persona's kind 0 profile)
              </Label>
              <Textarea
                id="persona-bio"
                rows={2}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="persona-system-prompt">
                System prompt (private, encrypted in the backup)
              </Label>
              <Textarea
                id="persona-system-prompt"
                rows={5}
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="persona-tags">
                  Topical tags (comma separated)
                </Label>
                <Input
                  id="persona-tags"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="rwanda, press-freedom"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="persona-languages">
                  Languages (comma separated)
                </Label>
                <Input
                  id="persona-languages"
                  value={languagesInput}
                  onChange={(e) => setLanguagesInput(e.target.value)}
                  placeholder="en, rw"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="persona-voice">Voice id (placeholder)</Label>
              <Input
                id="persona-voice"
                value={voiceId}
                onChange={(e) => setVoiceId(e.target.value)}
                placeholder="alloy"
              />
              <p className="text-xs text-muted-foreground">
                Voice sample generation lands in Phase 2. The id is
                stored now so the wizard can re-use it later.
              </p>
            </div>

            <div className="flex justify-end">
              <Button onClick={publishPersona} disabled={publishing || !user}>
                {publishing ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Publishing…
                  </>
                ) : (
                  "Mint persona"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

function parseList(raw: string, fallback: string[]): string[] {
  const parts = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return parts.length > 0 ? parts : fallback;
}

export default Onboard;
