export const queryKeys = {
  nostr: {
    all: ["nostr"] as const,
    author: (pubkey: string | undefined) =>
      ["nostr", "author", pubkey ?? ""] as const,
    authors: () => ["nostr", "author"] as const,
    logins: (loginIds: string) => ["nostr", "logins", loginIds] as const,
  },
  persona: {
    detail: (npub: string | undefined, userPubkey: string | undefined) =>
      ["phoenix-persona", npub, userPubkey] as const,
    allDetails: () => ["phoenix-persona"] as const,
    mine: (userPubkey: string | undefined) =>
      ["phoenix-my-personas", userPubkey] as const,
    allMine: () => ["phoenix-my-personas"] as const,
    activity: (sortedPubkeys: string) =>
      ["phoenix-persona-activity", sortedPubkeys] as const,
    posts: (npub: string | undefined, limit: number) =>
      ["phoenix-persona-posts", npub, limit] as const,
    allPosts: () => ["phoenix-persona-posts"] as const,
    interactions: (eventId: string | undefined) =>
      ["phoenix-post-interactions", eventId ?? ""] as const,
    publicProfile: (pubkey: string | undefined) =>
      ["persona-public-profile", pubkey ?? ""] as const,
    allPublicProfiles: () => ["persona-public-profile"] as const,
  },
  wallet: {
    detail: (walletId: string | undefined) => ["wallet", walletId ?? ""] as const,
    payments: (walletId: string | undefined) =>
      ["wallet-payments", walletId ?? ""] as const,
  },
  operator: {
    envelope: (pubkey: string | undefined) =>
      ["phoenix-operator-envelope", pubkey] as const,
  },
  ppq: {
    account: () => ["ppq", "account"] as const,
    balance: (creditId: string | undefined) => ["ppq", "balance", creditId] as const,
    allBalances: () => ["ppq", "balance"] as const,
    topup: (invoiceId: string | null | undefined) =>
      ["ppq", "topup", invoiceId] as const,
    nwcAutoTopup: () => ["ppq", "nwc-auto-topup"] as const,
    video: (id: string | undefined) => ["ppq", "video", id] as const,
  },
} as const;
