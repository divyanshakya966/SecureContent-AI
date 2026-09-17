import { describe, it, expect } from "vitest";
import { AuditQuerySchema, ToneEnum, LanguageEnum, DetailLevelEnum, ObjectiveEnum, StyleEnum, parseOr400 } from "@/lib/validation/schemas";

describe("validation hardening", () => {
  it("rejects out-of-range audit take values", () => {
    expect(parseOr400(AuditQuerySchema, { take: "9999" }).ok).toBe(false);
    expect(parseOr400(AuditQuerySchema, { take: "0" }).ok).toBe(false);
    expect(parseOr400(AuditQuerySchema, { take: "50" }).ok).toBe(true);
    expect(parseOr400(AuditQuerySchema, {}).ok).toBe(true);
  });

  it("rejects unknown generation control values", () => {
    expect(ToneEnum.safeParse("nope").success).toBe(false);
    expect(ToneEnum.safeParse("professional").success).toBe(true);
    expect(LanguageEnum.safeParse("xx").success).toBe(false);
    expect(DetailLevelEnum.safeParse("ultra").success).toBe(false);
    expect(ObjectiveEnum.safeParse("hack").success).toBe(false);
    expect(StyleEnum.safeParse("ransom").success).toBe(false);
  });
});
