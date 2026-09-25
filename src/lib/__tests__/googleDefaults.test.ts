// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { BUILD_DEFAULT_GOOGLE_CLIENT_ID, isValidGoogleClientId, resolveGoogleClientId } from "../googleDrive";

describe("Client ID پیش‌فرضِ گوگل (راه‌اندازی صفر)", () => {
  it("پیش‌فرضِ بیلد، یک Client ID واقعی و معتبر است — دوستان هیچ چیزی وارد نمی‌کنند", () => {
    expect(isValidGoogleClientId(BUILD_DEFAULT_GOOGLE_CLIENT_ID)).toBe(true);
    expect(resolveGoogleClientId(undefined)).toBe(BUILD_DEFAULT_GOOGLE_CLIENT_ID);
    expect(resolveGoogleClientId({})).toBe(BUILD_DEFAULT_GOOGLE_CLIENT_ID);
    expect(resolveGoogleClientId({ googleDrive: { clientId: "  " } })).toBe(BUILD_DEFAULT_GOOGLE_CLIENT_ID);
  });

  it("Client ID شخصیِ معتبر بر پیش‌فرض پیشی می‌گیرد", () => {
    const mine = "123456789012-abcdefghijklmnopqrstuvwxyz123456.apps.googleusercontent.com";
    expect(resolveGoogleClientId({ googleDrive: { clientId: mine } })).toBe(mine);
    expect(resolveGoogleClientId({ googleDrive: { clientId: ` ${mine} ` } })).toBe(mine);
  });

  it("مقدار شخصیِ خراب/نیمه‌کاره به پیش‌فرض برمی‌گردد (به‌جای خاموش‌شدن کارت)", () => {
    expect(resolveGoogleClientId({ googleDrive: { clientId: "garbage" } })).toBe(BUILD_DEFAULT_GOOGLE_CLIENT_ID);
    expect(resolveGoogleClientId({ googleDrive: { clientId: "323792267077-x" } })).toBe(BUILD_DEFAULT_GOOGLE_CLIENT_ID);
  });
});
