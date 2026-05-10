import { describe, it, expect } from "vitest";
import { resolveEntityLogo, getCategoryIconUrl } from "./logos";

describe("resolveEntityLogo", () => {
  it("returns image with logoUrl when provided (merchant path)", () => {
    const result = resolveEntityLogo({
      logoUrl: "https://plaid-merchant-logos.plaid.com/walmart_1100.png",
      name: "Walmart",
    });
    expect(result).toEqual({
      type: "image",
      src: "https://plaid-merchant-logos.plaid.com/walmart_1100.png",
    });
  });

  it("returns image with base64 data URI when logoBase64 provided", () => {
    const result = resolveEntityLogo({
      logoBase64: "iVBORw0KGgo=",
      name: "Chase",
    });
    expect(result).toEqual({
      type: "image",
      src: "data:image/png;base64,iVBORw0KGgo=",
    });
  });

  it("returns category icon URL when pfcPrimary provided", () => {
    const result = resolveEntityLogo({
      pfcPrimary: "FOOD_AND_DRINK",
      name: "Unknown Merchant",
    });
    expect(result).toEqual({
      type: "image",
      src: "https://plaid-category-icons.plaid.com/PFC_FOOD_AND_DRINK.png",
    });
  });

  it("returns initials with deterministic color when nothing else available", () => {
    const result = resolveEntityLogo({ name: "Walmart" });
    expect(result.type).toBe("initials");
    if (result.type === "initials") {
      expect(result.initial).toBe("W");
      expect(result.backgroundColor).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
    const result2 = resolveEntityLogo({ name: "Walmart" });
    expect(result).toEqual(result2);
  });

  it("uses primaryColor for initials background when provided", () => {
    const result = resolveEntityLogo({
      name: "Chase",
      primaryColor: "#004977",
    });
    expect(result).toEqual({
      type: "initials",
      initial: "C",
      backgroundColor: "#004977",
    });
  });

  it("prefers logoUrl over logoBase64 over pfcPrimary", () => {
    const result = resolveEntityLogo({
      logoUrl: "https://example.com/logo.png",
      logoBase64: "iVBORw0KGgo=",
      pfcPrimary: "FOOD_AND_DRINK",
      name: "Test",
    });
    expect(result).toEqual({
      type: "image",
      src: "https://example.com/logo.png",
    });
  });
});

describe("getCategoryIconUrl", () => {
  it("produces correct Plaid category icon URL", () => {
    expect(getCategoryIconUrl("FOOD_AND_DRINK")).toBe(
      "https://plaid-category-icons.plaid.com/PFC_FOOD_AND_DRINK.png"
    );
    expect(getCategoryIconUrl("GENERAL_MERCHANDISE")).toBe(
      "https://plaid-category-icons.plaid.com/PFC_GENERAL_MERCHANDISE.png"
    );
  });
});
