/**
 * /dev/inference-pay — demo the wallet → credits → AI inference path
 * end-to-end without the full Onboard wizard.
 *
 * Paste a mnemonic to init the wallet, then click either:
 *   - "Run a chat completion" → usePpqInference
 *   - "Generate an image" → usePpqImage
 *
 * Both flows lazy-create a ppq.ai account on first call, draw down the
 * credit, and rely on NWC auto-topup (if the wallet is funded) to keep
 * inference running. The harness shows balances before/after each call
 * so the auto-topup path is visible.
 */

import { useState } from "react";
import { Image as ImageIcon, Loader2, MessageSquare, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/useToast";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useWallet } from "@/hooks/useWallet";
import { usePpqInference } from "@/hooks/usePpqInference";
import { usePpqImage } from "@/hooks/usePpqImage";
import { generateMnemonic } from "@/lib/wallet/client";
import { readEnv } from "@/lib/env";

const PINNED_MNEMONIC = readEnv("VITE_WALLET_SEED");

function fmtSats(n: number | undefined): string {
  if (typeof n !== "number") return "—";
  return `${n.toLocaleString("en-US")} sats`;
}
function fmtMoney(n: number | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

export default function InferencePayHarness() {
  usePageMeta({ title: "/dev/inference-pay — Phoenix" });
  const { toast } = useToast();

  const [mnemonicInput, setMnemonicInput] = useState(PINNED_MNEMONIC ?? "");
  const [activeMnemonic, setActiveMnemonic] = useState<string | undefined>(undefined);
  const [generating, setGenerating] = useState(false);

  const wallet = useWallet({
    walletId: activeMnemonic ? "dev:inference-pay" : undefined,
    mnemonic: activeMnemonic,
  });
  const chat = usePpqInference();
  const image = usePpqImage();

  const [chatPrompt, setChatPrompt] = useState(
    'Reply with exactly the phrase "hello world" — nothing else.',
  );
  const [chatModel, setChatModel] = useState("anthropic/claude-sonnet-4.5");
  const [imagePrompt, setImagePrompt] = useState(
    "A red phoenix rising over a thousand hills, watercolor.",
  );
  const [imageModel, setImageModel] = useState("openai/gpt-image-1");

  async function generate() {
    setGenerating(true);
    try {
      const m = await generateMnemonic();
      setMnemonicInput(m);
      setActiveMnemonic(m);
      toast({ title: "New mnemonic generated" });
    } catch (e) {
      toast({
        title: "Mnemonic generation failed",
        description: e instanceof Error ? e.message : "unknown error",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  }

  function connect() {
    const m = mnemonicInput.trim();
    if (!m) {
      toast({
        title: "Paste a mnemonic",
        variant: "destructive",
      });
      return;
    }
    setActiveMnemonic(m);
  }

  async function runChat() {
    try {
      await chat.mutateAsync({
        model: chatModel,
        messages: [{ role: "user", content: chatPrompt }],
      });
      // Refresh balances post-call so the auto-topup effect is visible.
      wallet.refreshInfo();
      wallet.refreshPpqBalance();
    } catch (e) {
      toast({
        title: "Chat completion failed",
        description: e instanceof Error ? e.message : "unknown error",
        variant: "destructive",
      });
    }
  }

  async function runImage() {
    try {
      await image.mutateAsync({
        model: imageModel,
        prompt: imagePrompt,
        n: 1,
      });
      wallet.refreshInfo();
      wallet.refreshPpqBalance();
    } catch (e) {
      toast({
        title: "Image generation failed",
        description: e instanceof Error ? e.message : "unknown error",
        variant: "destructive",
      });
    }
  }

  const chatText =
    chat.data?.choices?.[0]?.message?.content ?? null;
  const imageSrc = image.data?.data?.[0]?.url ?? null;

  return (
    <main className="min-h-screen bg-background p-6 md:p-10">
      <div className="max-w-3xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-semibold">/dev/inference-pay</h1>
          <p className="text-sm text-muted-foreground">
            Wallet → credits → PPQ inference end-to-end. Auto-topup pulls
            from the Spark wallet whenever credits dip below the threshold.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mnemonic</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={mnemonicInput}
              onChange={(e) => setMnemonicInput(e.target.value)}
              placeholder="paste BIP-39 mnemonic"
              rows={2}
              className="font-mono text-xs"
              disabled={Boolean(activeMnemonic)}
            />
            <div className="flex gap-2">
              {!activeMnemonic ? (
                <>
                  <Button onClick={connect} disabled={!mnemonicInput.trim()}>
                    Connect
                  </Button>
                  <Button variant="outline" onClick={generate} disabled={generating}>
                    {generating ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Wand2 className="h-4 w-4 mr-2" />
                    )}
                    Generate new
                  </Button>
                </>
              ) : (
                <Button variant="outline" onClick={() => setActiveMnemonic(undefined)}>
                  Disconnect
                </Button>
              )}
            </div>
            {activeMnemonic ? (
              <div className="grid grid-cols-2 gap-3 text-sm pt-3 border-t">
                <div>
                  <p className="text-xs text-muted-foreground">Spark balance</p>
                  <p className="font-mono">{fmtSats(wallet.info?.balanceSats)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">PPQ credit</p>
                  <p className="font-mono">{fmtMoney(wallet.ppqBalanceUsd)}</p>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {activeMnemonic ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" /> Chat completion
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="chat-model">Model</Label>
                  <Input
                    id="chat-model"
                    value={chatModel}
                    onChange={(e) => setChatModel(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="chat-prompt">Prompt</Label>
                  <Textarea
                    id="chat-prompt"
                    value={chatPrompt}
                    onChange={(e) => setChatPrompt(e.target.value)}
                    rows={2}
                  />
                </div>
                <Button onClick={runChat} disabled={chat.isPending}>
                  {chat.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Running…
                    </>
                  ) : (
                    "Run chat completion"
                  )}
                </Button>
                {chatText ? (
                  <div className="rounded border p-3 text-sm whitespace-pre-wrap font-mono">
                    {chatText}
                  </div>
                ) : null}
                {chat.error ? (
                  <p className="text-sm text-destructive">{chat.error.message}</p>
                ) : null}
                {chat.data?.usage ? (
                  <p className="text-xs text-muted-foreground">
                    tokens: prompt={chat.data.usage.prompt_tokens}, completion=
                    {chat.data.usage.completion_tokens}
                  </p>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ImageIcon className="h-4 w-4" /> Image generation
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="image-model">Model</Label>
                  <Input
                    id="image-model"
                    value={imageModel}
                    onChange={(e) => setImageModel(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="image-prompt">Prompt</Label>
                  <Textarea
                    id="image-prompt"
                    value={imagePrompt}
                    onChange={(e) => setImagePrompt(e.target.value)}
                    rows={2}
                  />
                </div>
                <Button onClick={runImage} disabled={image.isPending}>
                  {image.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating…
                    </>
                  ) : (
                    "Generate image"
                  )}
                </Button>
                {imageSrc ? (
                  <img
                    src={imageSrc}
                    alt="Generated"
                    className="rounded border max-w-full"
                  />
                ) : null}
                {image.error ? (
                  <p className="text-sm text-destructive">{image.error.message}</p>
                ) : null}
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </main>
  );
}
