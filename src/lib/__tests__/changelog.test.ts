import { describe, expect, it } from "vitest";
import { APP_VERSION } from "../appVersion";
import { CHANGELOG, unseenChangelog } from "../changelog";

describe("release notes for the latest app versions", () => {
  it("keeps runtime release notes aligned with the current app version", () => {
    expect(CHANGELOG[0]?.version).toBe(APP_VERSION);
  });

  it("includes the current 1.21 release and the missing 1.20 release", () => {
    expect(CHANGELOG.slice(0, 2).map((entry) => entry.version)).toEqual([
      "1.21.0",
      "1.20.0",
    ]);
  });

  it("shows both 1.20 and 1.21 to someone updating from 1.19", () => {
    expect(unseenChangelog("1.19.0").map((entry) => entry.version)).toEqual([
      "1.21.0",
      "1.20.0",
    ]);
  });

  it("backfills both releases if an old build marked 1.21 seen without showing its notes", () => {
    expect(unseenChangelog("1.21.0").map((entry) => entry.version)).toEqual([
      "1.21.0",
      "1.20.0",
    ]);
  });

  it("shows only 1.21 to someone who has actually seen 1.20 notes", () => {
    expect(unseenChangelog("1.21.0", "1.20.0").map((entry) => entry.version)).toEqual([
      "1.21.0",
    ]);
  });

  it("does not show already-seen releases again", () => {
    expect(unseenChangelog("1.21.0", "1.21.0")).toEqual([]);
  });
});
