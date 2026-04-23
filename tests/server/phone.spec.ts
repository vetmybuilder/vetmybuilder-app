import { describe, it, expect } from "vitest";
import { isValidUKPhone, cleanPhone } from "../../server/lib/phone.js";

describe("isValidUKPhone", () => {
  const VALID = [
    "07123456789",       // mobile, no spacing
    "07123 456789",      // mobile, with space
    "07123-456-789",     // mobile, with dashes
    "+447123456789",     // mobile with +44
    "+44 7123 456789",   // mobile with +44 and spaces
    "02079460958",       // London landline
    "020 7946 0958",     // London landline with spaces
    "+442079460958",     // London landline with +44
    "01332812345",       // regional landline
    "03001234567",       // 03 non-geographic
    "08001234567",       // 08 freephone
  ];
  const INVALID = [
    "",                                  // empty
    " ",                                 // whitespace only
    "09043535345322342342",              // too long (20 digits, starts 09)
    "12345",                             // too short, no leading 0/+44
    "+15551234567",                      // non-UK country code
    "05123456789",                       // UK leading 0 but second digit not 1/2/3/7/8
    "0912345678",                        // starts 09 (premium rate — not accepted)
    "071234",                            // too short after valid prefix
    "abc",                               // non-numeric
  ];

  for (const input of VALID) {
    it(`accepts ${JSON.stringify(input)}`, () => {
      expect(isValidUKPhone(input)).toBe(true);
    });
  }
  for (const input of INVALID) {
    it(`rejects ${JSON.stringify(input)}`, () => {
      expect(isValidUKPhone(input)).toBe(false);
    });
  }

  it("treats null and undefined as invalid", () => {
    expect(isValidUKPhone(null)).toBe(false);
    expect(isValidUKPhone(undefined)).toBe(false);
  });

  it("does not mutate cleanPhone behavior", () => {
    expect(cleanPhone("  07123 456789  ")).toBe("07123456789");
  });
});
