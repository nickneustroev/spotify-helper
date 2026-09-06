import { describe, expect, it, vi } from "vitest";
import type { Logger, SpotifyClientConfig } from "../src/shared/types.js";
import { SpotifyClient } from "../src/spotify/spotify-client.js";
import type { AuthManager } from "../src/spotify/auth-manager.js";

const log: Logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const cfg: SpotifyClientConfig = {
  requestTimeoutMs: 5000,
  minRequestGapMs: 0,
  spotifyProxyUrl: "",
};

function createClient(fetchImpl: typeof fetch): SpotifyClient {
  const auth = {
    getAccessToken: vi.fn().mockResolvedValue("token"),
    handleUnauthorized: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuthManager;

  return new SpotifyClient(auth, cfg, log, fetchImpl);
}

function buildItemsPage(count: number, startIndex: number, next: string | null): string {
  return JSON.stringify({
    items: Array.from({ length: count }, (_, i) => ({
      added_at: "2026-01-01T00:00:00Z",
      item: { id: `t${startIndex + i}`, uri: `spotify:track:t${startIndex + i}` },
    })),
    next,
  });
}

describe("SpotifyClient.getPlaylistItems", () => {
  it("stops pagination early once maxItems is reached", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("offset=50")) {
        return new Response(buildItemsPage(50, 50, null), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(buildItemsPage(50, 0, "https://api.spotify.com/v1/playlists/p1/items?limit=50&offset=50"), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const client = createClient(fetchImpl);
    const items = await client.getPlaylistItems("p1", 10);

    expect(items).toHaveLength(10);
    expect(items[0]?.trackUri).toBe("spotify:track:t0");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("reads all pages when maxItems is not given", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("offset=50")) {
        return new Response(buildItemsPage(20, 50, null), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(buildItemsPage(50, 0, "https://api.spotify.com/v1/playlists/p1/items?limit=50&offset=50"), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const client = createClient(fetchImpl);
    const items = await client.getPlaylistItems("p1");

    expect(items).toHaveLength(70);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("SpotifyClient request counter", () => {
  it("counts completed requests", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("playlists")) {
        return new Response(buildItemsPage(1, 0, null), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ id: "user-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const client = createClient(fetchImpl);

    await client.getCurrentUserId();
    await client.getPlaylistItems("p1", 1);
    await client.getPlaylistItems("p1", 1);
    expect(client.getCompletedRequestCount()).toBe(3);
  });
});
