import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "@/test/api";

import { NostrSync } from "@/components/NostrSync";
import { useAuthor } from "@/hooks/useAuthor";
import { useLoginActions } from "@/hooks/useLoginActions";
import { useOperatorEnvelope } from "@/hooks/useOperatorEnvelope";
import {
  clearPersonaDecryptCache,
  useMyPersonas,
} from "@/hooks/usePersona";
import { usePersonaPublish } from "@/hooks/usePersonaPublish";

import {
  loginFor,
  operatorEnvelopeEvent,
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

  it("shares the operator-authored kind 30078 relay scan across operator and persona hooks", async () => {
    const operator = await operatorEnvelopeEvent({
      operator: testKeys.operator,
      dTag: "operator-fixture",
    });
    const persona = await personaEnvelopeEvent({
      operator: testKeys.operator,
      persona: testKeys.persona,
      dTag: "persona-fixture",
      name: "Amina Test",
    });
    const harness = await createRelayHarness({
      events: [operator.event, persona.event],
      logins: [loginFor(testKeys.operator)],
    });
    harnesses.push(harness);

    const { result } = renderHook(
      () => ({
        operator: useOperatorEnvelope(),
        personas: useMyPersonas(),
      }),
      { wrapper: harness.wrapper },
    );

    await waitFor(() => expect(result.current.operator.isLoading).toBe(false));
    await waitFor(() => expect(result.current.personas.isSuccess).toBe(true));

    const personaReqs = harness.relay.messages
      .map((message) => JSON.parse(message) as unknown)
      .filter((message): message is ["REQ", string, ...Array<{ kinds?: number[] }>] =>
        Array.isArray(message) &&
        message[0] === "REQ" &&
        message.slice(2).some((filter) =>
          typeof filter === "object" &&
          filter !== null &&
          Array.isArray(filter.kinds) &&
          filter.kinds.includes(30078),
        ),
      );
    expect(personaReqs).toHaveLength(1);
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

  it("does not show prior-operator personas after logging into another operator", async () => {
    const persona = await personaEnvelopeEvent({
      operator: testKeys.operator,
      persona: testKeys.persona,
      name: "Amina Test",
    });
    const harness = await createRelayHarness({
      events: [persona.event],
      logins: [loginFor(testKeys.operator)],
    });
    harnesses.push(harness);

    function PersonaCountProbe() {
      const personas = useMyPersonas();
      const login = useLoginActions();
      return (
        <>
          <NostrSync />
          <button type="button" onClick={() => void login.nsec(testKeys.operatorAlt.nsec)}>
            Log in alt
          </button>
          <output data-testid="persona-count">{personas.data?.length ?? 0}</output>
        </>
      );
    }

    render(<PersonaCountProbe />, { wrapper: harness.wrapper });

    await waitFor(() => expect(screen.getByTestId("persona-count").textContent).toBe("1"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Log in alt" }));
    });
    await waitFor(() => expect(screen.getByTestId("persona-count").textContent).toBe("0"));
  });
});
