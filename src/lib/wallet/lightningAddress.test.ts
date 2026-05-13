import { beforeEach, describe, expect, it, vi } from "@/test/api";

import type { WalletHandle } from "./types";
import {
  LightningUsernameTakenError,
  isValidLightningUsername,
  probeLightningUsernameAvailability,
  registerLightningAddressWithRetry,
  slugifyForUsername,
} from "./lightningAddress";

function makeHandle({
  available,
  registerRejects,
}: {
  available: boolean[];
  registerRejects?: boolean;
}): WalletHandle {
  return {
    checkLightningAddressAvailable: vi.fn(async () => {
      return available.shift() ?? true;
    }),
    registerLightningAddress: vi.fn(async ({ username }: { username: string }) => {
      if (registerRejects) throw new Error("register collision");
      return {
        username,
        lightningAddress: `${username}@breez.tips`,
        lnurl: { bech32: "lnurl1" },
      };
    }),
  } as unknown as WalletHandle;
}

describe("Lightning Address helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("slugifies display names into valid usernames", () => {
    expect(slugifyForUsername("Voice of Rwanda")).toBe("voice-of-rwanda");
    expect(slugifyForUsername("Imani Hakizimana")).toBe("imani-hakizimana");
    expect(slugifyForUsername("Café Maman")).toBe("cafe-maman");
    expect(slugifyForUsername("--leading--hyphens--")).toBe("leading-hyphens");
    expect(slugifyForUsername("")).toBe("");
    expect(slugifyForUsername("a".repeat(50))).toHaveLength(30);
    expect(slugifyForUsername("!!!@@@")).toBe("");
  });

  it("validates Lightning Address usernames", () => {
    expect(isValidLightningUsername("imani")).toBe(true);
    expect(isValidLightningUsername("imani-jr")).toBe(true);
    expect(isValidLightningUsername("imani-7k2p")).toBe(true);
    expect(isValidLightningUsername("-imani")).toBe(false);
    expect(isValidLightningUsername("Imani")).toBe(false);
    expect(isValidLightningUsername("")).toBe(false);
    expect(isValidLightningUsername("a".repeat(30))).toBe(true);
    expect(isValidLightningUsername("a".repeat(31))).toBe(false);
  });

  it("probes username availability via the LUD-16 endpoint", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(probeLightningUsernameAvailability("imani")).resolves.toBe(
      "available",
    );

    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 200 }));
    await expect(probeLightningUsernameAvailability("imani")).resolves.toBe(
      "taken",
    );

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    await expect(probeLightningUsernameAvailability("imani")).resolves.toBe(
      "error",
    );

    fetchMock.mockRejectedValueOnce(new Error("network"));
    await expect(probeLightningUsernameAvailability("imani")).resolves.toBe(
      "error",
    );

    await expect(probeLightningUsernameAvailability("-bad")).resolves.toBe(
      "error",
    );
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("throws when the requested Lightning Address username is taken", async () => {
    const handle = makeHandle({ available: [false] });

    await expect(
      registerLightningAddressWithRetry(handle, {
        baseUsername: "imani",
        fallbackBase: "persona",
      }),
    ).rejects.toMatchObject({
      name: "LightningUsernameTakenError",
      username: "imani",
    });

    expect(handle.registerLightningAddress).not.toHaveBeenCalled();
  });

  it("wraps register-time collisions as username-taken errors", async () => {
    const handle = makeHandle({ available: [true], registerRejects: true });

    await expect(
      registerLightningAddressWithRetry(handle, {
        baseUsername: "imani",
      }),
    ).rejects.toBeInstanceOf(LightningUsernameTakenError);
  });
});
