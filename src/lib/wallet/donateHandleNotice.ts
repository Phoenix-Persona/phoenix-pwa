export type DonateHandleNotice =
  | { kind: "missing" }
  | { kind: "error"; message: string };

export interface DonateHandleNoticeInput {
  hasPersona: boolean;
  hasWalletSeed: boolean;
  isInfoLoading: boolean;
  infoError: Error | undefined;
  lightningAddress: string | undefined;
  dismissed: boolean;
}

export function getDonateHandleNotice({
  hasPersona,
  hasWalletSeed,
  isInfoLoading,
  infoError,
  lightningAddress,
  dismissed,
}: DonateHandleNoticeInput): DonateHandleNotice | null {
  if (!hasPersona || !hasWalletSeed || dismissed || isInfoLoading) return null;
  if (lightningAddress) return null;
  if (infoError) {
    return { kind: "error", message: infoError.message };
  }
  return { kind: "missing" };
}
