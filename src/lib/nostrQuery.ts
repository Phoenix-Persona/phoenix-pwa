export function withNostrQueryTimeout(
  parentSignal: AbortSignal | undefined,
  timeoutMs: number,
): AbortSignal {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  if (parentSignal?.aborted) {
    controller.abort();
  } else {
    parentSignal?.addEventListener("abort", () => controller.abort(), {
      once: true,
    });
  }

  controller.signal.addEventListener(
    "abort",
    () => globalThis.clearTimeout(timeoutId),
    { once: true },
  );

  return controller.signal;
}
