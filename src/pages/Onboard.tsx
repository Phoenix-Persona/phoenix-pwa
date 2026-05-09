/**
 * Onboard — character-creator entry point.
 *
 * Renders a form for minting a new persona. On submit, generates a
 * fresh keypair, encrypts the configuration to the user's own Nostr
 * key, publishes the encrypted backup to relays, and publishes a
 * public kind 0 profile so the persona's feed is discoverable.
 *
 * The agent-driven creator (`CharacterCreator.tsx`) layers on top of
 * this same publish path when it's ready.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSeoMeta } from "@unhead/react";
import { Loader2, Sparkles } from "lucide-react";
import { useNostr } from "@nostrify/react";

import { AppHeader } from "@/components/AppHeader";
import { FlagStripe, ImigongoSeal } from "@/components/ImigongoBand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
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
  useSeoMeta({ title: "Create a persona — Feniksi" });
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
      <AppHeader />

      <main id="main-content" className="flex-1">
        {/* Cover band — charcoal mat with seal accent */}
        <section className="relative overflow-hidden hero-mat text-imigongo-cream">
          <div
            className="absolute inset-0 imigongo-pattern-bold text-imigongo-cream opacity-[0.05] pointer-events-none"
            aria-hidden="true"
          />
          <div
            className="absolute -top-32 -right-24 w-[32rem] h-[32rem] rounded-full bg-rw-gold/15 blur-3xl pointer-events-none"
            aria-hidden="true"
          />

          <div className="container relative py-12 md:py-16 max-w-3xl">
            <div className="flex items-center gap-5">
              <div className="relative flex-shrink-0 hidden sm:block">
                <div
                  className="absolute -inset-3 rounded-2xl bg-gradient-to-br from-rw-gold/40 to-imigongo-clay/30 blur-2xl"
                  aria-hidden="true"
                />
                <div className="relative bg-imigongo-charcoal/60 rounded-2xl p-3 ring-1 ring-rw-gold/30">
                  <ImigongoSeal size={64} colorClass="text-rw-gold" />
                </div>
              </div>
              <div className="space-y-3">
                <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-rw-gold font-semibold">
                  <span className="h-px w-6 bg-rw-gold" />
                  New voice
                </p>
                <h1 className="font-display text-4xl md:text-5xl font-medium tracking-tight leading-tight">
                  Create a persona
                </h1>
                <p className="text-imigongo-cream/80 leading-relaxed max-w-xl">
                  Mint a new voice. Feniksi generates a fresh Nostr keypair
                  for the persona — only you can operate it. The configuration
                  below is encrypted to your key and published privately to
                  relays; the persona's public profile goes out so anyone
                  can find and follow its feed.
                </p>
              </div>
            </div>
          </div>
          <FlagStripe height={4} />
        </section>

        {/* Form */}
        <div className="container py-10 max-w-2xl">
          <Card className="border-imigongo-clay/20 bg-gradient-to-br from-card via-card to-rw-gold-soft/10 overflow-hidden">
            <div className="bg-gradient-to-r from-rw-sky/10 via-rw-gold/10 to-rw-green/10 px-6 py-4 border-b border-imigongo-clay/15 flex items-center justify-between">
              <h2 className="font-display text-2xl font-medium tracking-tight">
                New persona
              </h2>
              <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-semibold">
                Encrypted at rest
              </span>
            </div>
            <CardContent className="space-y-5 pt-5">
              <div className="space-y-2">
                <Label htmlFor="persona-name">Name</Label>
                <Input
                  id="persona-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Voice of Rwanda"
                  className="bg-background/60"
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
                  className="bg-background/60"
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
                  className="bg-background/60"
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
                    className="bg-background/60"
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
                    className="bg-background/60"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="persona-voice">Voice</Label>
                <Input
                  id="persona-voice"
                  value={voiceId}
                  onChange={(e) => setVoiceId(e.target.value)}
                  placeholder="alloy"
                  className="bg-background/60"
                />
                <p className="text-xs text-muted-foreground">
                  Voice id used when the persona generates audio. The
                  default works fine if you're not sure.
                </p>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  onClick={publishPersona}
                  disabled={publishing || !user}
                  size="lg"
                  className="rounded-full px-8 shadow-lg shadow-primary/20"
                >
                  {publishing ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Publishing…
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 size-4" />
                      Mint persona
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
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
