import { describe, expect, it } from "vitest";
import { APP_VERSION } from "../appVersion";
import { CHANGELOG, unseenChangelog } from "../changelog";

describe("release notes for the latest app versions", () => {
  it("keeps runtime release notes aligned with the current app version", () => {
    expect(CHANGELOG[0]?.version).toBe(APP_VERSION);
  });

  it("has unique, descending versions and non-empty notes", () => {
    const versions = CHANGELOG.map((entry) => entry.version);
    expect(new Set(versions).size).toBe(versions.length);
    for (const entry of CHANGELOG.slice(0, 4)) {
      expect(entry.items.length).toBeGreaterThan(0);
      expect(entry.title.length).toBeGreaterThan(3);
    }
    expect(CHANGELOG.slice(0, 2).map((entry) => entry.version)).toEqual(["1.23.0", "1.22.0"]);
  });

  it("shows every release newer than the version the user has seen", () => {
    expect(unseenChangelog("1.22.0", "1.22.0").map((entry) => entry.version)).toEqual(["1.23.0"]);
    expect(unseenChangelog("1.19.0", "1.19.0").map((entry) => entry.version).slice(0, 2)).toEqual(["1.23.0", "1.22.0"]);
  });

  it("backfills the 1.20/1.21 notes for old builds without a notes marker", () => {
    expect(unseenChangelog("1.21.0").map((entry) => entry.version)).toEqual(["1.23.0", "1.22.0", "1.21.0", "1.20.0"]);
  });

  it("does not show already-seen releases again", () => {
    expect(unseenChangelog("1.23.0", "1.23.0")).toEqual([]);
  });

  it("shows only the newest entry to a first-time visitor", () => {
    expect(unseenChangelog(undefined).map((entry) => entry.version)).toEqual(["1.23.0"]);
  });
});
