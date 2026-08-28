import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchFaviconDataUri } from "./favicon";

describe("fetchFaviconDataUri", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("fetches the domain's favicon and returns it as a base64 data URI", async () => {
    const bytes = new Uint8Array([137, 80, 78, 71]);
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "image/png" }),
      arrayBuffer: async () => bytes.buffer,
    });

    const result = await fetchFaviconDataUri("chase.com");

    expect(result).toBe(`data:image/png;base64,${Buffer.from(bytes).toString("base64")}`);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://icons.duckduckgo.com/ip3/chase.com.ico",
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it("returns null when the response is not ok", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    expect(await fetchFaviconDataUri("nowhere.example")).toBeNull();
  });

  it("returns null when the response isn't an image", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "text/html" }),
    });
    expect(await fetchFaviconDataUri("nowhere.example")).toBeNull();
  });

  it("returns null when fetch throws instead of propagating the error", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));
    expect(await fetchFaviconDataUri("nowhere.example")).toBeNull();
  });
});
