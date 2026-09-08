import { describe, expect, it } from "vitest";
import { initLocale, t } from "../src/i18n/index.js";

describe("playlist labels i18n", () => {
  it("returns english playlist labels for EN locale", () => {
    initLocale("EN");

    expect(t("savedRecentPlaylistsLabel")).toBe("recently saved");
    expect(t("savedInYearPlaylistsLabel")).toBe("by year");
    expect(t("mergedPlaylistsLabel")).toBe("merged");
    expect(t("playlistRecentPlaylistsLabel")).toBe("top of playlist");
  });

  it("returns russian playlist labels for RU locale", () => {
    initLocale("RU");

    expect(t("savedRecentPlaylistsLabel")).toBe("недавно сохранённого");
    expect(t("savedInYearPlaylistsLabel")).toBe("по годам");
    expect(t("mergedPlaylistsLabel")).toBe("сборных");
    expect(t("playlistRecentPlaylistsLabel")).toBe("первых N треков плейлиста");
  });
});
