// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";
import { getStoredAuth, saveStoredAuth } from "../googleDrive";

describe("Google Drive Auth Storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("saves and retrieves stored auth properly", () => {
    expect(getStoredAuth()).toBeNull();
    const future = Date.now() + 3600 * 1000;
    saveStoredAuth({
      accessToken: "mock_token_123",
      expiresAt: future,
      lastSyncAt: 12345678,
    });

    const stored = getStoredAuth();
    expect(stored).not.toBeNull();
    expect(stored?.accessToken).toBe("mock_token_123");
    expect(stored?.lastSyncAt).toBe(12345678);
  });

  it("returns null if token is expired", () => {
    const past = Date.now() - 1000;
    saveStoredAuth({
      accessToken: "expired_token",
      expiresAt: past,
    });

    expect(getStoredAuth()).toBeNull();
  });

  it("removes stored auth when null is passed", () => {
    saveStoredAuth({
      accessToken: "mock_token",
      expiresAt: Date.now() + 10000,
    });
    expect(getStoredAuth()).not.toBeNull();
    saveStoredAuth(null);
    expect(getStoredAuth()).toBeNull();
  });
});
