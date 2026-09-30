import { describe, expect, it } from "vitest";
import { CONTACT_CC, CONTACT_INBOXES, contactRequestSchema, teamEmail } from "./contact-request";

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    type: "sales",
    name: "Amara Okafor",
    email: "amara@example.com",
    company: "Grand Meridian Hotel",
    businessType: "XYVOO HMS",
    urgency: "",
    message: "We run two properties and want a demo.",
    ...overrides,
  };
}

describe("contactRequestSchema", () => {
  it("accepts a complete sales enquiry", () => {
    expect(contactRequestSchema.safeParse(makeRequest()).success).toBe(true);
  });

  it("rejects an invalid email", () => {
    expect(contactRequestSchema.safeParse(makeRequest({ email: "not-an-email" })).success).toBe(false);
  });

  it("rejects an unknown request type", () => {
    expect(contactRequestSchema.safeParse(makeRequest({ type: "billing" })).success).toBe(false);
  });

  it("requires a hotel or storefront name for support requests", () => {
    const result = contactRequestSchema.safeParse(makeRequest({ type: "support", company: "" }));
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((i) => i.path.join(".") === "company")).toBe(true);
  });
});

describe("teamEmail", () => {
  it("routes sales enquiries to hello@ and support requests to support@", () => {
    const sales = contactRequestSchema.parse(makeRequest());
    const support = contactRequestSchema.parse(makeRequest({ type: "support", urgency: "High" }));
    expect(teamEmail(sales).to).toBe(CONTACT_INBOXES.sales);
    expect(teamEmail(support).to).toBe(CONTACT_INBOXES.support);
  });

  it("copies oche.francis@ on every contact-form email", () => {
    expect(CONTACT_CC).toEqual(["oche.francis@getxyvoo.com"]);
    for (const type of ["sales", "support"]) {
      expect(teamEmail(contactRequestSchema.parse(makeRequest({ type }))).cc).toEqual(CONTACT_CC);
    }
  });

  it("uses the branded layout with a reference, logo and reply button", () => {
    const req = contactRequestSchema.parse(makeRequest());
    const email = teamEmail(req, "CNT-TEST22", new Date("2026-09-30T11:26:00Z"));
    expect(email.reference).toBe("CNT-TEST22");
    expect(email.subject).toContain("[CNT-TEST22]");
    expect(email.html).toContain(`src="cid:xyvoo-logo@getxyvoo.com"`);
    expect(email.html).toContain("Reply to Amara");
    expect(email.html).toContain("mailto:amara@example.com?subject=");
    expect(email.text).toContain("30 Sept 2026, 12:26 WAT");
  });

  it("shows an urgency badge on support requests", () => {
    const req = contactRequestSchema.parse(makeRequest({ type: "support", urgency: "Urgent — business-critical" }));
    const { html } = teamEmail(req);
    expect(html).toContain(">Urgent</span>");
  });

  it("escapes HTML in the message and keeps the subject on one line", () => {
    const req = contactRequestSchema.parse(makeRequest({ name: "Eve\r\nBcc: x@example.com", message: "<script>alert(1)</script>" }));
    const email = teamEmail(req);
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.subject).not.toMatch(/[\r\n]/);
  });
});
