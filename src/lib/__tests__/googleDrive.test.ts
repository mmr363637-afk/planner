// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  downloadStateFromGoogleDrive,
  getStoredAuth,
  googleAuthErrorMessage,
  isGoogleClientId,
  loadGoogleApi,
  requestGoogleAccessToken,
  saveStoredAuth,
  uploadStateToGoogleDrive,
} from "../googleDrive";
import { parseStateText } from "../stateIO";

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
    saveStoredAuth({
      accessToken: "expired_token",
      expiresAt: Date.now() - 1000,
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

describe("Google OAuth setup validation", () => {
  it("only accepts the public Web Client ID shape, never a secret or placeholder", () => {
    expect(isGoogleClientId("123456789012-abc-def.apps.googleusercontent.com")).toBe(true);
    expect(isGoogleClientId(" 123456789012-abc.apps.googleusercontent.com ")).toBe(true);
    expect(isGoogleClientId("")).toBe(false);
    expect(isGoogleClientId("not-a-client-id")).toBe(false);
    expect(isGoogleClientId("client-secret-should-never-be-here")).toBe(false);
  });

  it("turns common Google Identity errors into actionable Persian messages", () => {
    expect(googleAuthErrorMessage("origin_mismatch")).toMatch(/origin/i);
    expect(googleAuthErrorMessage({ type: "popup_closed" })).toMatch(/بسته شد/);
    expect(googleAuthErrorMessage("invalid_client")).toMatch(/Client ID/);
    expect(googleAuthErrorMessage(new Error("پیام اختصاصی فارسی"))).toBe("پیام اختصاصی فارسی");
  });

  it("rejects an invalid Client ID before it tries to inject Google’s script", async () => {
    await expect(requestGoogleAccessToken("fake-client")).rejects.toThrow(/Client ID معتبر/);
    expect(document.getElementById("google-gsi-client")).toBeNull();
  });

  it("removes a failed GSI script so a later retry injects a fresh one", async () => {
    const firstLoad = loadGoogleApi();
    const firstScript = document.getElementById("google-gsi-client") as HTMLScriptElement;
    expect(firstScript).toBeTruthy();
    firstScript.dispatchEvent(new Event("error"));
    await expect(firstLoad).rejects.toThrow(/بارگذاری/);
    expect(document.getElementById("google-gsi-client")).toBeNull();

    const retryLoad = loadGoogleApi();
    const retryScript = document.getElementById("google-gsi-client") as HTMLScriptElement;
    expect(retryScript).toBeTruthy();
    expect(retryScript).not.toBe(firstScript);
    retryScript.dispatchEvent(new Event("error"));
    await expect(retryLoad).rejects.toThrow(/بارگذاری/);
  });
});

describe("Google Drive backup transport", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("uploads the state only after looking up the appDataFolder backup", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ files: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "new-file" }), { status: 200 }));
    const state = parseStateText("{}")!;
    state.activeSession = { topicId: null, mode: "free", phase: "work", cycle: 0, running: true, startedAt: 1, accumulatedMs: 2, totalStudyMs: 3, sessionStartedAt: 1 };

    const result = await uploadStateToGoogleDrive(state, "token");

    expect(result.success).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(String(fetchSpy.mock.calls[0][0])).toContain("spaces=appDataFolder");
    expect(String(fetchSpy.mock.calls[1][0])).toContain("uploadType=multipart");
    const init = fetchSpy.mock.calls[1][1] as RequestInit;
    expect(String(init.body)).toContain('"activeSession": null');
  });

  it("downloads a valid app state from the private backup file", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ files: [{ id: "backup-id" }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ flashcards: [{ id: "c1", front: "رو", back: "پشت" }] }), { status: 200 }));

    const downloaded = await downloadStateFromGoogleDrive("token");

    expect(downloaded?.flashcards).toHaveLength(1);
    expect(downloaded?.flashcards[0].front).toBe("رو");
  });

  it("clears the local token after a 401 instead of leaving a false connected state", async () => {
    saveStoredAuth({ accessToken: "expired-at-server", expiresAt: Date.now() + 3600_000 });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("", { status: 401, statusText: "Unauthorized" }));

    await expect(uploadStateToGoogleDrive(parseStateText("{}")!, "expired-at-server")).rejects.toThrow(/منقضی/);
    expect(getStoredAuth()).toBeNull();
  });
});
