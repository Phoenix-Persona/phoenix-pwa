import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSeoMeta } from "@unhead/react";
import { Loader2 } from "lucide-react";

import { PhoenixHeader } from "@/components/PhoenixHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/useToast";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useNostr } from "@nostrify/react";

import {
  buildEncryptedPersonaTemplate,
  DEFAULT_FREQUENCY_SEC,
  DEFAULT_PERSONA_MODEL,
  generatePersonaDTag,
  type PersonaConfig,
  type PersonaSource,
} from "@/lib/persona";
import {
  encryptPhoenixEnvelope,
  type Nip44Signer,
} from "@/lib/personaCrypto";
import {
  generatePersonaKeypair,
  signWithPersona,
  type PersonaKeypair,
} from "@/lib/personaKey";
import { styleText, toStylingPayload } from "@/lib/styleClient";

type StepId = "splash" | "explainer" | "qa" | "sample" | "confirm";

const STEPS: { id: StepId; label: string }[] = [
  { id: "splash", label: "Sign in" },
  { id: "explainer", label: "How it works" },
  { id: "qa", label: "Persona details" },
  { id: "sample", label: "Hear it speak" },
  { id: "confirm", label: "Confirm" },
];

type Draft = Omit<PersonaConfig, "personaNsec">;

const defaultDraft: Draft = {
  name: "Voice of Rwanda",
  region: "RW",
  cause: "human-rights",
  languages: ["en", "rw"],
  tone: "measured, fact-based, urgent without sensationalism",
  frequencySec: DEFAULT_FREQUENCY_SEC,
  sources: [
    { kind: "rss", url: "https://www.bbc.com/news/world/africa/rss.xml" },
    { kind: "url", url: "https://www.hrw.org/africa/rwanda" },
  ],
  focus: ["press freedom", "political prisoners", "elections"],
  model: DEFAULT_PERSONA_MODEL,
  systemPrompt:
    "You are an AI-assisted activist voice from Rwanda. You write with precision, avoid sensationalism, ground every claim in cited sources, and treat genocide memory with care. You speak truth to power without dehumanizing anyone. You write in clear English unless asked otherwise.",
  personality: "measured, fact-based, urgent without sensationalism",
  bio:
    "An AI-assisted voice from Rwanda. Curating press freedom, political prisoners, and elections coverage from trusted sources.",
  voiceStyle:
    "Direct sentences. No corporate jargon. No emoji unless the source uses them. Reference specific events and sources.",
  avoidTopics: ["minimizing the 1994 genocide", "ethnic generalizations"],
};

const Onboard = () => {
  useSeoMeta({ title: "Create a persona — Phoenix" });
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { toast } = useToast();

  const [stepIdx, setStepIdx] = useState(0);
  const [draft, setDraft] = useState<Draft>(defaultDraft);
  const [sample, setSample] = useState<string>("");
  const [sampling, setSampling] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const step = STEPS[stepIdx];

  // Persona keypair — generated lazily on first need (sample or confirm).
  const [pendingKeypair, setPendingKeypair] = useState<PersonaKeypair | null>(
    null
  );
  function ensureKeypair(): PersonaKeypair {
    if (pendingKeypair) return pendingKeypair;
    const kp = generatePersonaKeypair();
    setPendingKeypair(kp);
    return kp;
  }

  const fullConfig = useMemo<PersonaConfig | null>(() => {
    if (!pendingKeypair) return null;
    return { ...draft, personaNsec: pendingKeypair.nsec };
  }, [draft, pendingKeypair]);

  function next() {
    setStepIdx((i) => Math.min(i + 1, STEPS.length - 1));
  }
  function back() {
    setStepIdx((i) => Math.max(i - 1, 0));
  }

  function updateSource(idx: number, patch: Partial<PersonaSource>) {
    setDraft((d) => ({
      ...d,
      sources: d.sources.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    }));
  }
  function addSource() {
    setDraft((d) => ({
      ...d,
      sources: [...d.sources, { kind: "url", url: "" }],
    }));
  }
  function removeSource(idx: number) {
    setDraft((d) => ({
      ...d,
      sources: d.sources.filter((_, i) => i !== idx),
    }));
  }

  async function generateSample() {
    if (!user) return;
    const kp = ensureKeypair();
    const candidate: PersonaConfig = { ...draft, personaNsec: kp.nsec };
    setSampling(true);
    setSample("");
    try {
      const seed =
        "Hello world from a new voice. This is the first message Phoenix will publish on my behalf.";
      const res = await styleText({
        text: seed,
        persona: toStylingPayload(candidate),
      });
      setSample(res.styled);
    } catch (e) {
      toast({
        title: "Sample generation failed",
        description:
          e instanceof Error
            ? e.message
            : "The styling endpoint is unreachable. You can still confirm and try again from the dashboard.",
        variant: "destructive",
      });
      setSample(
        "(Sample unavailable — styling endpoint is offline. You can confirm now and retry from the dashboard.)"
      );
    } finally {
      setSampling(false);
    }
  }

  async function confirmAndPublish() {
    if (!user || !fullConfig || !pendingKeypair) {
      // Ensure keypair exists (user could skip the sample step).
      const kp = pendingKeypair ?? ensureKeypair();
      const config: PersonaConfig = { ...draft, personaNsec: kp.nsec };
      await doPublish(kp, config);
      return;
    }
    await doPublish(pendingKeypair, fullConfig);
  }

  async function doPublish(kp: PersonaKeypair, config: PersonaConfig) {
    if (!user) return;
    setPublishing(true);
    try {
      const signer = user.signer as unknown as Nip44Signer;

      // 1. Encrypt the Phoenix envelope (operator self-encryption).
      //    Discriminator + persona pubkey live INSIDE the ciphertext so
      //    the event tag layout reveals nothing Phoenix-specific.
      const ciphertext = await encryptPhoenixEnvelope(
        { personaPubkey: kp.hex.pk, config },
        user.pubkey,
        signer
      );

      // 2. Build + sign with a random UUID d-tag — no identifying tags.
      const personaTemplate = buildEncryptedPersonaTemplate({
        dTag: generatePersonaDTag(),
        encryptedContent: ciphertext,
      });

      const operatorSigned = await user.signer.signEvent(personaTemplate);
      await nostr.event(operatorSigned, {
        signal: AbortSignal.timeout(8000),
      });

      // 3. Publish a public kind 0 profile for the persona so its feed page
      //    is browsable by anyone (no Phoenix-specific knowledge required).
      const profileEvent = signWithPersona(
        {
          kind: 0,
          created_at: Math.floor(Date.now() / 1000),
          tags: [],
          content: JSON.stringify({
            name: config.name,
            display_name: config.name,
            about: config.bio,
            picture: "",
          }),
        },
        kp
      );
      await nostr.event(profileEvent, {
        signal: AbortSignal.timeout(8000),
      });

      toast({
        title: "Persona published",
        description: `${config.name} is live and private to you.`,
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

  // Quick safety: surface if the user hasn't signed in.
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <PhoenixHeader />

      <main className="flex-1 container py-10 max-w-3xl">
        {/* Progress */}
        <ol className="flex items-center justify-between mb-10 text-xs font-medium">
          {STEPS.map((s, i) => (
            <li
              key={s.id}
              className={`flex-1 flex flex-col items-center text-center ${
                i === stepIdx
                  ? "text-primary"
                  : i < stepIdx
                    ? "text-foreground"
                    : "text-muted-foreground"
              }`}
            >
              <div
                className={`size-8 rounded-full grid place-items-center mb-2 border-2 ${
                  i <= stepIdx
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card"
                }`}
              >
                {i + 1}
              </div>
              <span className="hidden sm:block">{s.label}</span>
            </li>
          ))}
        </ol>

        <Card>
          {step.id === "splash" && (
            <>
              <CardHeader>
                <CardTitle>Sign in with your Nostr identity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">
                  Phoenix uses your Nostr key to mark you as the persona's
                  operator and to encrypt the persona config so only you can
                  use it. Sign in with your existing Nostr identity — the
                  persona will get its own separate keypair.
                </p>
                {user ? (
                  <p className="rounded-lg bg-muted p-4 font-mono text-sm break-all">
                    Signed in as <strong>{user.pubkey.slice(0, 16)}…</strong>
                  </p>
                ) : (
                  <p className="rounded-lg border border-dashed p-4 text-sm">
                    Use the &ldquo;Join&rdquo; button in the header to sign in
                    with your Nostr key, then return here.
                  </p>
                )}
                <div className="flex justify-end">
                  <Button onClick={next} disabled={!user}>
                    Continue →
                  </Button>
                </div>
              </CardContent>
            </>
          )}

          {step.id === "explainer" && (
            <>
              <CardHeader>
                <CardTitle>What you're about to build</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-muted-foreground">
                <p>
                  You are about to create a <strong>persona</strong> — an
                  AI-assisted voice with its own Nostr identity. The persona
                  will publish posts under its own keypair, while the
                  configuration (system prompt, sources, voice spec) is
                  encrypted to your Nostr key. Nobody else can clone the
                  persona — only you can operate it.
                </p>
                <p className="font-medium text-foreground">Best practices</p>
                <ul className="list-disc list-inside space-y-1.5">
                  <li>Curate trusted, citable source material.</li>
                  <li>Define the voice precisely. Specific is better than general.</li>
                  <li>
                    Always preview before posting. Phoenix flags every post
                    as AI-styled with sources.
                  </li>
                  <li>
                    The persona's keys are stored inside the encrypted config.
                    Sign in on any device with your Nostr key to recover.
                  </li>
                </ul>
                <div className="flex justify-between pt-2">
                  <Button variant="ghost" onClick={back}>← Back</Button>
                  <Button onClick={next}>Continue →</Button>
                </div>
              </CardContent>
            </>
          )}

          {step.id === "qa" && (
            <>
              <CardHeader>
                <CardTitle>Persona details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="region">Region (ISO-2)</Label>
                    <Input
                      id="region"
                      value={draft.region}
                      onChange={(e) =>
                        setDraft({ ...draft, region: e.target.value.toUpperCase() })
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="cause">Cause (slug)</Label>
                    <Input
                      id="cause"
                      value={draft.cause}
                      onChange={(e) => setDraft({ ...draft, cause: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="lang">Languages (comma-separated)</Label>
                  <Input
                    id="lang"
                    value={draft.languages.join(", ")}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        languages: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="tone">Tone</Label>
                  <Input
                    id="tone"
                    value={draft.tone}
                    onChange={(e) => setDraft({ ...draft, tone: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="bio">Public bio</Label>
                  <Textarea
                    id="bio"
                    rows={3}
                    value={draft.bio}
                    onChange={(e) => setDraft({ ...draft, bio: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    The bio is also published as the persona's public Nostr profile.
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="prompt">System prompt (voice spec)</Label>
                  <Textarea
                    id="prompt"
                    rows={6}
                    value={draft.systemPrompt}
                    onChange={(e) =>
                      setDraft({ ...draft, systemPrompt: e.target.value })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    This is encrypted to your Nostr key. Be specific about what to avoid.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Sources</Label>
                  {draft.sources.map((s, i) => (
                    <div key={i} className="flex gap-2">
                      <select
                        className="rounded-md border border-input bg-background px-3 text-sm"
                        value={s.kind}
                        onChange={(e) =>
                          updateSource(i, { kind: e.target.value as PersonaSource["kind"] })
                        }
                      >
                        <option value="rss">RSS</option>
                        <option value="url">URL</option>
                      </select>
                      <Input
                        value={s.url}
                        placeholder="https://…"
                        onChange={(e) => updateSource(i, { url: e.target.value })}
                      />
                      <Button type="button" variant="ghost" onClick={() => removeSource(i)}>
                        ×
                      </Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={addSource}>
                    + Add source
                  </Button>
                </div>
                <div className="flex justify-between pt-2">
                  <Button variant="ghost" onClick={back}>← Back</Button>
                  <Button onClick={next}>Continue →</Button>
                </div>
              </CardContent>
            </>
          )}

          {step.id === "sample" && (
            <>
              <CardHeader>
                <CardTitle>Hear it speak</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">
                  Generate a sample post in the persona's voice. This sample
                  is preview-only — it is <strong>not</strong> published to relays.
                </p>
                <Button onClick={generateSample} disabled={sampling} className="w-full">
                  {sampling ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Generating sample…
                    </>
                  ) : sample ? (
                    "Regenerate sample"
                  ) : (
                    "Generate sample post"
                  )}
                </Button>
                {sample && (
                  <div className="rounded-lg border border-imigongo-clay/30 bg-imigongo-clay/5 p-4">
                    <div className="text-xs uppercase tracking-wider text-imigongo-clay font-medium mb-2">
                      Sample · {draft.name}
                    </div>
                    <p className="whitespace-pre-wrap leading-relaxed">{sample}</p>
                  </div>
                )}
                <div className="flex justify-between pt-2">
                  <Button variant="ghost" onClick={back}>← Back</Button>
                  <Button onClick={next}>Continue →</Button>
                </div>
              </CardContent>
            </>
          )}

          {step.id === "confirm" && (
            <>
              <CardHeader>
                <CardTitle>Confirm and publish</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">
                  Phoenix will encrypt <strong>{draft.name}</strong>'s
                  configuration to your Nostr key, sign it as you, and publish
                  it to your relays. The persona will also publish its public
                  Nostr profile so its feed is browsable by anyone.
                </p>
                <div className="rounded-lg bg-muted p-4 text-sm space-y-1">
                  <div><span className="text-muted-foreground">Name: </span>{draft.name}</div>
                  <div><span className="text-muted-foreground">Region: </span>{draft.region}</div>
                  <div><span className="text-muted-foreground">Cause: </span>{draft.cause}</div>
                  <div><span className="text-muted-foreground">Languages: </span>{draft.languages.join(", ")}</div>
                  <div><span className="text-muted-foreground">Sources: </span>{draft.sources.length}</div>
                </div>
                <div className="flex justify-between pt-2">
                  <Button variant="ghost" onClick={back} disabled={publishing}>← Back</Button>
                  <Button onClick={confirmAndPublish} disabled={publishing}>
                    {publishing ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        Publishing…
                      </>
                    ) : (
                      "Publish persona"
                    )}
                  </Button>
                </div>
              </CardContent>
            </>
          )}
        </Card>
      </main>
    </div>
  );
};

export default Onboard;
