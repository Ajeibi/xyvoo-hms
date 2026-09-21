import { describe, expect, it } from "vitest";
import { buildCheckoutReceiptEmail } from "./receipts";
import type { FolioLineRow } from "./folio";

function line(overrides: Partial<FolioLineRow>): FolioLineRow {
  return {
    id: "line-1",
    reservation_id: "res-1",
    kind: "charge",
    amount: 0,
    method: "system",
    description: null,
    department: null,
    split_leg: "guest",
    reference: null,
    created_at: "2026-08-01T00:00:00Z",
    voided_at: null,
    voided_by: null,
    void_reason: null,
    ...overrides,
  } as FolioLineRow;
}

describe("buildCheckoutReceiptEmail", () => {
  it("sums charges and payments into a correct balance", () => {
    const { subject, text, html } = buildCheckoutReceiptEmail({
      hotelName: "Lagoon View Hotel",
      guestName: "Ada Obi",
      confirmationCode: "CONF-1",
      roomCode: "204",
      folioNumber: "F-100",
      currency: "NGN",
      checkedOutAt: "2026-08-05T10:00:00Z",
      lines: [
        line({ kind: "charge", amount: 45000, description: "Room charge" }),
        line({ kind: "charge", amount: 8000, description: "Room service" }),
        line({ kind: "payment", amount: -50000, description: "Card payment" }),
      ],
    });

    expect(subject).toContain("F-100");
    expect(text).toContain("Total charges:");
    expect(text).toContain("Total paid:");
    expect(text).toContain("Balance:");
    // 53,000 charged, 50,000 paid → 3,000 outstanding
    expect(text).toMatch(/Balance: .*3,000/);
    expect(html).toContain("Ada Obi");
    expect(html).toContain("204");
  });

  it("excludes voided lines from every total", () => {
    const { text } = buildCheckoutReceiptEmail({
      hotelName: "Lagoon View Hotel",
      guestName: "Ada Obi",
      confirmationCode: "CONF-1",
      roomCode: null,
      folioNumber: "F-100",
      currency: "NGN",
      checkedOutAt: "2026-08-05T10:00:00Z",
      lines: [
        line({ kind: "charge", amount: 45000, description: "Room charge" }),
        line({ kind: "charge", amount: 999999, description: "Voided mistake", voided_at: "2026-08-05T09:00:00Z" }),
        line({ kind: "payment", amount: -45000, description: "Cash" }),
      ],
    });

    expect(text).not.toContain("999,999");
    expect(text).toMatch(/Balance: .*0/);
  });

  it("treats a discount (negative charge) as reducing total charges", () => {
    const { text } = buildCheckoutReceiptEmail({
      hotelName: "Lagoon View Hotel",
      guestName: "Ada Obi",
      confirmationCode: "CONF-1",
      roomCode: null,
      folioNumber: "F-100",
      currency: "NGN",
      checkedOutAt: "2026-08-05T10:00:00Z",
      lines: [
        line({ kind: "charge", amount: 10000, description: "Room charge" }),
        line({ kind: "discount", amount: -2000, description: "Loyalty discount" }),
        line({ kind: "payment", amount: -8000, description: "Cash" }),
      ],
    });

    expect(text).toMatch(/Total charges: .*8,000/);
    expect(text).toMatch(/Balance: .*0/);
  });
});
