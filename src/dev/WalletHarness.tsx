/**
 * /dev/wallet — paste a BIP-39 mnemonic (or generate one) → init the
 * Spark wallet → render <WalletPanel>. The harness exists so the team
 * can demo wallet primitives without going through the full Onboard
 * wizard. Same components as the Dashboard's WalletDialog.
 */

import { useState } from "react";
import { Loader2, Wand2 } from "lucide-react";
import { useSeoMeta } from "@unhead/react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/useToast";
import { useWallet } from "@/hooks/useWallet";
import { generateMnemonic } from "@/lib/wallet/client";
import { readEnv } from "@/lib/env";
import { WalletPanel } from "@/components/wallet/WalletPanel";

const PINNED_MNEMONIC = readEnv("VITE_WALLET_SEED");

export default function WalletHarness() {
  useSeoMeta({ title: "/dev/wallet — Phoenix" });
  const { toast } = useToast();

  const [mnemonicInput, setMnemonicInput] = useState(PINNED_MNEMONIC ?? "");
  const [activeMnemonic, setActiveMnemonic] = useState<string | undefined>(undefined);
  const [generating, setGenerating] = useState(false);

  const wallet = useWallet({
    walletId: activeMnemonic ? "dev:wallet-harness" : undefined,
    mnemonic: activeMnemonic,
  });

  async function generate() {
    setGenerating(true);
    try {
      const m = await generateMnemonic();
      setMnemonicInput(m);
      setActiveMnemonic(m);
      toast({
        title: "New mnemonic generated",
        description: "Test wallet only. Don't fund it with serious sats.",
      });
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
        description: "12, 15, 18, 21, or 24 words.",
        variant: "destructive",
      });
      return;
    }
    setActiveMnemonic(m);
  }

  function disconnect() {
    setActiveMnemonic(undefined);
  }

  return (
    <main className="min-h-screen bg-background p-6 md:p-10">
      <div className="max-w-2xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-semibold">/dev/wallet</h1>
          <p className="text-sm text-muted-foreground">
            Spark wallet harness. Paste a mnemonic (or generate one) to
            connect; the panel below renders the same components used in the
            Dashboard.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mnemonic</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="mnemonic">BIP-39 mnemonic</Label>
              <Textarea
                id="mnemonic"
                value={mnemonicInput}
                onChange={(e) => setMnemonicInput(e.target.value)}
                placeholder="abandon abandon … about (12 / 15 / 18 / 21 / 24 words)"
                rows={3}
                className="font-mono text-xs"
                disabled={Boolean(activeMnemonic)}
              />
            </div>
            <div className="flex gap-2">
              {!activeMnemonic ? (
                <>
                  <Button onClick={connect} disabled={!mnemonicInput.trim()}>
                    Connect
                  </Button>
                  <Button
                    variant="outline"
                    onClick={generate}
                    disabled={generating}
                  >
                    {generating ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Wand2 className="h-4 w-4 mr-2" />
                    )}
                    Generate new
                  </Button>
                </>
              ) : (
                <Button variant="outline" onClick={disconnect}>
                  Disconnect
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {activeMnemonic ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Wallet</CardTitle>
            </CardHeader>
            <CardContent>
              <WalletPanel wallet={wallet} />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </main>
  );
}
