/**
 * Onboard — character-creator wizard.
 *
 * Two-step flow:
 *   1. Details — name, bio, system prompt, tags, languages, voice id.
 *   2. Picture — upload an image OR generate via PPQ. Skippable; the
 *      persona ships without a picture if the user chooses.
 *
 * On submit, generates a fresh keypair, encrypts the configuration to
 * the user's own Nostr key, publishes the encrypted backup to relays,
 * and publishes a public kind 0 profile.
 *
 * The agent-driven creator (`CharacterCreator.tsx`) layers on top of
 * the same publish path when it's ready.
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSeoMeta } from "@unhead/react";
import {
  ArrowLeft,
  ArrowRight,
  HelpCircle,
  Loader2,
  Sparkles,
} from "lucide-react";
import { NSecSigner } from "@nostrify/nostrify";
import { hexToBytes } from "@noble/hashes/utils.js";

import { AppHeader } from "@/components/AppHeader";
import { FlagStripe, ImigongoSeal } from "@/components/ImigongoBand";
import { PersonaPictureField } from "@/components/PersonaPictureField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/useToast";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useCreatePersona } from "@/hooks/useCreatePersona";
import { useUsernameAvailability } from "@/hooks/useUsernameAvailability";

import { generatePersonaKeypair } from "@/lib/personaKey";
import {
  slugifyForUsername,
  isValidLightningUsername,
  SPARK_LN_DOMAIN,
} from "@/lib/wallet/lightningAddress";

type WizardStep = "details" | "picture";

const Onboard = () => {
  useSeoMeta({ title: "Create a persona — Zuka" });
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const createPersona = useCreatePersona();

  const [step, setStep] = useState<WizardStep>("details");

  // Details
  const [name, setName] = useState("Voice of Rwanda");
  // Username drives the breez.tips LN address. Auto-derives from
  // `name` while untouched; once the user edits it, we stop syncing
  // (tracked by `usernameDirty`).
  const [username, setUsername] = useState(slugifyForUsername("Voice of Rwanda"));
  const [usernameDirty, setUsernameDirty] = useState(false);
  const [bio, setBio] = useState(
    "An AI-assisted voice. Press freedom, civil society, the long memory."
  );
  const [systemPrompt, setSystemPrompt] = useState(
    "You are an AI-assisted activist voice. Write with precision. Avoid sensationalism. Ground every claim in cited sources. Speak truth without dehumanizing anyone."
  );

  // Picture
  const [pictureUrl, setPictureUrl] = useState("");

  // Generate the persona's keypair UPFRONT — before the picture step.
  //
  // **Privacy.** The picture upload happens before publish; if we wait
  // until createPersona to mint the keypair, the upload's BUD-01 auth
  // event is signed by the operator and correlates operator ↔ persona
  // on every Blossom server. Generating early lets us pass an
  // NSecSigner through to PersonaPictureField so the auth event uses
  // the persona's pubkey only.
  //
  // useState lazy initializer so the keypair persists across re-renders
  // and is not re-generated on every render. The same kp is then handed
  // to useCreatePersona via the `keypair` field.
  const [personaKeypair] = useState(() => generatePersonaKeypair());
  const personaSigner = useMemo(
    () => new NSecSigner(hexToBytes(personaKeypair.hex.sk)),
    [personaKeypair.hex.sk],
  );

  const publishing = createPersona.isPending;

  // Live availability hint for the username field. Debounced HTTP probe
  // against the public LUD-16 endpoint. The mint path's authoritative
  // SDK check still runs and fixes any race against this preview.
  const availability = useUsernameAvailability(username);

  // Auto-sync username from the display name until the user takes
  // control of it. Single source of truth: changing `name` updates
  // `username` *only* if `usernameDirty` is false.
  function onNameChange(next: string) {
    setName(next);
    if (!usernameDirty) {
      setUsername(slugifyForUsername(next));
    }
  }

  function onUsernameChange(next: string) {
    // Constrain to LN-address characters as the user types — strip
    // anything that wouldn't survive the registration step anyway.
    const cleaned = next.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setUsername(cleaned);
    setUsernameDirty(true);
  }

  function goNext() {
    if (!name.trim()) {
      toast({
        title: "Display name required",
        description: "Give the persona a name before continuing.",
        variant: "destructive",
      });
      return;
    }
    if (username && !isValidLightningUsername(username)) {
      toast({
        title: "Invalid username",
        description: "Usernames must start with a letter or digit and contain only lowercase letters, digits, and hyphens.",
        variant: "destructive",
      });
      return;
    }
    setStep("picture");
  }

  async function publishPersona() {
    if (!user) {
      toast({
        title: "Sign in first",
        description: "You need a Nostr signer to create a persona.",
        variant: "destructive",
      });
      return;
    }
    try {
      const result = await createPersona.mutateAsync({
        name,
        username,
        bio,
        systemPrompt,
        pictureUrl: pictureUrl || undefined,
        keypair: personaKeypair,
      });

      if (result.warning) {
        toast({
          title: "Lightning Address skipped",
          description: result.warning,
          variant: "destructive",
        });
      }

      toast({
        title: "Persona published",
        description: `${result.envelope.persona.name} is live and private to you.`,
      });
      navigate(`/dashboard/${result.npub}`);
    } catch (e) {
      toast({
        title: "Publish failed",
        description:
          e instanceof Error
            ? e.message
            : "Could not publish persona event to relays.",
        variant: "destructive",
      });
    }
  }

  // Suggest a starting prompt for the picture step based on what the
  // user wrote on the details step.
  const promptHint =
    name && bio
      ? `Stylized portrait of ${name}: ${truncate(bio, 80)}`
      : name
      ? `Stylized portrait of ${name}`
      : "";

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
                  New voice — step {step === "details" ? "1" : "2"} of 2
                </p>
                <h1 className="font-display text-4xl md:text-5xl font-medium tracking-tight leading-tight">
                  {step === "details" ? "Create a persona" : "Choose a face"}
                </h1>
                <p className="text-imigongo-cream/80 leading-relaxed max-w-xl">
                  {step === "details"
                    ? "Mint a new voice. Zuka generates a fresh Nostr keypair for the persona — only you can operate it. The configuration below is encrypted to your key and published privately to relays; the persona's public profile goes out so anyone can find and follow its feed."
                    : "Add a portrait so the persona has a face. Upload an image or generate one. You can skip this step and add a picture later."}
                </p>
              </div>
            </div>
          </div>
          <FlagStripe height={4} />
        </section>

        {/* Step body */}
        <div className="container py-10 max-w-2xl">
          <Card className="border-imigongo-clay/20 bg-gradient-to-br from-card via-card to-rw-gold-soft/10 overflow-hidden">
            <div className="bg-gradient-to-r from-rw-sky/10 via-rw-gold/10 to-rw-green/10 px-6 py-4 border-b border-imigongo-clay/15 flex items-center justify-between gap-3">
              <h2 className="font-display text-2xl font-medium tracking-tight">
                {step === "details" ? "Persona details" : "Profile picture"}
              </h2>

              {step === "details" ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-imigongo-clay/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
                      aria-label="How is my persona protected?"
                    >
                      <HelpCircle className="size-5" aria-hidden="true" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    side="bottom"
                    align="end"
                    className="w-80 text-sm leading-relaxed space-y-2"
                  >
                    <p className="font-medium text-foreground">
                      How your persona is protected
                    </p>
                    <p className="text-muted-foreground">
                      The configuration below is encrypted to your own Nostr
                      key (NIP-44) before it leaves your browser. Relays
                      store the ciphertext — only your signer can decrypt
                      it.
                    </p>
                    <p className="text-muted-foreground">
                      The persona's private key lives only inside that
                      encrypted backup. It never touches the network, and
                      never lands on disk in plaintext.
                    </p>
                  </PopoverContent>
                </Popover>
              ) : (
                <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-semibold">
                  Optional
                </span>
              )}
            </div>

            <CardContent className="space-y-5 pt-5">
              {step === "details" ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="persona-name">Display name</Label>
                    <Input
                      id="persona-name"
                      value={name}
                      onChange={(e) => onNameChange(e.target.value)}
                      placeholder="Voice of Rwanda"
                      className="bg-background/60"
                      autoFocus
                    />
                    <p className="text-xs text-muted-foreground">
                      Shown in posts and on the persona's public profile.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="persona-username">Username</Label>
                    <div className="flex items-center gap-1.5">
                      <Input
                        id="persona-username"
                        value={username}
                        onChange={(e) => onUsernameChange(e.target.value)}
                        placeholder="voice-of-rwanda"
                        className="bg-background/60 font-mono text-sm"
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <span className="text-sm text-muted-foreground whitespace-nowrap">
                        @{SPARK_LN_DOMAIN}
                      </span>
                    </div>
                    <UsernameAvailabilityHint state={availability} />
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

                  <div className="flex justify-end pt-2">
                    <Button
                      onClick={goNext}
                      size="lg"
                      className="rounded-full px-8 shadow-lg shadow-primary/20"
                    >
                      Next: profile picture
                      <ArrowRight className="ml-2 size-4" />
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <PersonaPictureField
                    value={pictureUrl}
                    onChange={setPictureUrl}
                    promptHint={promptHint}
                    // Onboarding users haven't funded a wallet yet — let
                    // the field fall back to the free Pollinations
                    // endpoint when PPQ returns 402 so they can still
                    // ship a portrait. EditPersona keeps PPQ-only
                    // (post-onboarding the user has the paid path).
                    allowFreeFallback
                    // Persona-keypair signer for the BUD-01 Blossom auth
                    // event. Without this, the upload would be signed by
                    // the operator and correlate operator ↔ persona on
                    // every Blossom server.
                    signer={personaSigner}
                  />

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border">
                    <Button
                      variant="ghost"
                      onClick={() => setStep("details")}
                      disabled={publishing}
                    >
                      <ArrowLeft className="mr-2 size-4" />
                      Back
                    </Button>

                    <div className="flex flex-wrap gap-2">
                      {!pictureUrl && (
                        <Button
                          variant="outline"
                          onClick={publishPersona}
                          disabled={publishing || !user}
                        >
                          Skip &amp; mint
                        </Button>
                      )}
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
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n).trimEnd() + "…";
}

function UsernameAvailabilityHint({
  state,
}: {
  state: ReturnType<typeof useUsernameAvailability>;
}) {
  // Stable layout: render a one-line hint at all states so the form
  // doesn't shift when status changes. Color carries the signal.
  switch (state.status) {
    case "idle":
      return (
        <p className="text-xs text-muted-foreground">
          URL-friendly handle. Becomes the persona's Lightning Address — donors
          zap <code className="font-mono">username@{SPARK_LN_DOMAIN}</code>.
        </p>
      );
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
          Checking <code className="font-mono">{state.username}@{SPARK_LN_DOMAIN}</code>…
        </p>
      );
    case "available":
      return (
        <p className="text-xs text-emerald-600 dark:text-emerald-500">
          <code className="font-mono">{state.username}@{SPARK_LN_DOMAIN}</code> is
          available.
        </p>
      );
    case "taken":
      return (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          <code className="font-mono">{state.username}@{SPARK_LN_DOMAIN}</code> is
          taken — we'll append a short random suffix on mint.
        </p>
      );
    case "error":
      return (
        <p className="text-xs text-muted-foreground">
          Couldn't reach the LNURL host — we'll try registration directly during
          mint.
        </p>
      );
  }
}

export default Onboard;
