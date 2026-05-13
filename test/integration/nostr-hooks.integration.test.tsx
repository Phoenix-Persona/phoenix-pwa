import { useNostrLogin } from "@nostrify/react/login";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "@/test/api";

import { NostrSync } from "@/components/NostrSync";
import { useAuthor } from "@/hooks/useAuthor";
import {
  clearPersonaDecryptCache,
  useMyPersonas,
} from "@/hooks/usePersona";
import { usePersonaPublish } from "@/hooks/usePersonaPublish";

import {
  loginFor,
  personaEnvelopeEvent,
  profileEvent,
  testKeys,
  unrelatedEncryptedAppEvent,
} from "./fixtures/nostr";
import { createRelayHarness, type RelayHarness } from "./harness/renderWithRelay";

const harnesses: RelayHarness[] = [];

beforeEach(() => {
  clearPersonaDecryptCache();
});

afterEach(async () => {
  cleanup();
  await Promise.all(harnesses.splice(0).map((harness) => harness.cleanup()));
});

describe("Nostr hook integration", () => {
  it("resolves author metadata from the local relay", async () => {
    const event = profileEvent(testKeys.persona, {
      name: "amina",
      display_name: "Amina Test",
      about: "Fixture profile",
    });
    const harness = await createRelayHarness({ events: [event] });
    harnesses.push(harness);

    const { result } = renderHook(() => useAuthor(testKeys.persona.pubkey), {
      wrapper: harness.wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.metadata?.display_name).toBe("Amina Test");
  });

  it("decrypts Zuka persona envelopes and ignores unrelated encrypted app data", async () => {
    const persona = await personaEnvelopeEvent({
      operator: testKeys.operator,
      persona: testKeys.persona,
      name: "Amina Test",
    });
    const unrelated = await unrelatedEncryptedAppEvent(testKeys.operator);
    const harness = await createRelayHarness({
      events: [persona.event, unrelated],
      logins: [loginFor(testKeys.operator)],
    });
    harnesses.push(harness);

    const { result } = renderHook(() => useMyPersonas(), { wrapper: harness.wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].envelope.persona.pubkey).toBe(testKeys.persona.pubkey);
  });

  it("publishes persona posts with the persona key and without operator identity tags", async () => {
    const harness = await createRelayHarness();
    harnesses.push(harness);

    const { result } = renderHook(() => usePersonaPublish(), { wrapper: harness.wrapper });
    await waitFor(() => expect(result.current).toBeTruthy());

    let event: Awaited<ReturnType<typeof result.current.mutateAsync>> | undefined;
    await act(async () => {
      event = await result.current.mutateAsync({
        personaNsec: testKeys.persona.nsec,
        template: {
          kind: 1,
          content: "Persona-authored note",
          tags: [["t", "freedom"]],
          created_at: 1_700_000_020,
        },
      });
    });
    if (!event) throw new Error("Persona publish mutation did not return an event.");

    expect(event.pubkey).toBe(testKeys.persona.pubkey);
    expect(event.tags).not.toContainEqual(["p", testKeys.operator.pubkey]);
    expect(event.tags.some((tag) => tag.includes("zuka") || tag.includes("phoenix"))).toBe(false);
    expect(harness.relay.getEvents({ authors: [testKeys.persona.pubkey], kinds: [1] })).toHaveLength(1);
  });

  it("does not show prior-operator personas after switching login", async () => {
    const persona = await personaEnvelopeEvent({
      operator: testKeys.operator,
      persona: testKeys.persona,
      name: "Amina Test",
    });
    const harness = await createRelayHarness({
      events: [persona.event],
      logins: [loginFor(testKeys.operator), loginFor(testKeys.operatorAlt)],
    });
    harnesses.push(harness);

    function PersonaCountProbe() {
      const personas = useMyPersonas();
      const { setLogin } = useNostrLogin();
      return (
        <>
          <NostrSync />
          <button type="button" onClick={() => setLogin(loginFor(testKeys.operatorAlt).id)}>
            Switch
          </button>
          <output data-testid="persona-count">{personas.data?.length ?? 0}</output>
        </>
      );
    }

    render(<PersonaCountProbe />, { wrapper: harness.wrapper });

    await waitFor(() => expect(screen.getByTestId("persona-count").textContent).toBe("1"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Switch" }));
    });
    await waitFor(() => expect(screen.getByTestId("persona-count").textContent).toBe("0"));
  });
});
