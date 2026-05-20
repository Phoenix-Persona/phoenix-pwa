import { afterEach, beforeEach, describe, expect, it, mockFn, spyOn, stubGlobal, unstubAllGlobals } from "@/test/api";

import { getQueryHistory } from "./client";

describe("ppq client query history", () => {
  beforeEach(() => {
    stubGlobal(
      "fetch",
      mockFn(async () =>
        new Response(
          JSON.stringify({
            status: "success",
            data: [
              {
                timestamp: "2026-05-10T12:00:00.000Z",
                model: "claude-sonnet-4.5",
                input_count: 100,
                output_count: 50,
                price_in_usd: 0.0123,
                query_type: "chat",
                query_source: "api",
                api_key_id: "key_123",
              },
            ],
            pagination: {
              page: 1,
              page_count: 20,
              total: 1,
              total_pages: 1,
            },
          }),
          { status: 200 },
        ),
      ),
    );
  });

  afterEach(() => {
    unstubAllGlobals();
  });

  it("fetches query history with all keys enabled", async () => {
    const history = await getQueryHistory("ppq_api_key", {
      page: 1,
      pageCount: 20,
      allKeys: true,
      baseUrl: "https://api.test",
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://api.test/queries/history?page=1&page_count=20&all_keys=true",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer ppq_api_key",
        }),
      }),
    );
    expect(history.data[0]?.price_in_usd).toBe(0.0123);
  });

  it("does not log request details by default", async () => {
    const logSpy = spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = spyOn(console, "error")
      .mockImplementation(() => undefined);

    await getQueryHistory("ppq_api_key", {
      page: 1,
      pageCount: 20,
      allKeys: true,
      baseUrl: "https://api.test",
    });

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
