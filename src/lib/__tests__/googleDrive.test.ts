// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";
import { getStoredAuth, isValidGoogleClientId, saveStoredAuth, toFaGoogleDriveError } from "../googleDrive";

describe("اعتبارسنجی Client ID و ترجمه‌ی خطاها", () => {
  it("فقط فرم استاندارد Client ID گوگل پذیرفته می‌شود", () => {
    expect(isValidGoogleClientId("1042784562044-a1b2c3d4e5f6g7h8i9j0k1l2m3.apps.googleusercontent.com")).toBe(true);
    expect(isValidGoogleClientId("1042784562044-8j3q4m8p2u7s2d3n4o5p6q7r8s9t0u1v.apps.googleusercontent.com ")).toBe(true); // trim
    expect(isValidGoogleClientId("")).toBe(false);
    expect(isValidGoogleClientId("abc.apps.googleusercontent.com")).toBe(false);
    expect(isValidGoogleClientId("1042784562044-x.apps.googleusercontent.com")).toBe(false);
    expect(isValidGoogleClientId("https://x.apps.googleusercontent.com")).toBe(false);
  });

  it("خطاهای رایج OAuth به راهنمای فارسی ترجمه می‌شوند", () => {
    expect(toFaGoogleDriveError(new Error("invalid_client"))).toMatch(/Client ID معتبر نیست/);
    expect(toFaGoogleDriveError(new Error("access_denied"))).toMatch(/Test users/);
    const popupErr = Object.assign(new Error("unknown"), { type: "popup_failed_to_open" });
    expect(toFaGoogleDriveError(popupErr)).toMatch(/پاپ‌آپ/);
    expect(toFaGoogleDriveError(new Error("نشست گوگل منقضی شده است."))).toMatch(/منقضی/);
  });
});

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
