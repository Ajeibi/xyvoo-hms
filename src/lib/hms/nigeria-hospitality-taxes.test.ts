import { describe, expect, it } from "vitest";
import {
  computeNigeriaHospitalityTaxes,
  NIGERIA_VAT_RATE_PERCENT,
  type NigeriaTaxExemptions,
} from "./nigeria-hospitality-taxes";

const noExemptions: NigeriaTaxExemptions = {
  exemptVat: false,
  exemptServiceCharge: false,
  exemptStateLevy: false,
  exemptStampLevy: false,
};

describe("computeNigeriaHospitalityTaxes", () => {
  it("stacks service charge and state levy before applying VAT on top", () => {
    const result = computeNigeriaHospitalityTaxes({
      roomTaxableBase: 1000,
      serviceChargeRatePercent: 10,
      stateLevyRatePercent: 5,
      exemptions: noExemptions,
    });

    expect(result.serviceChargeAmount).toBe(100);
    expect(result.stateLevyAmount).toBe(50);
    // VAT is charged on (base + service + state levy) = 1150, at 7.5%
    expect(result.vatRatePercent).toBe(NIGERIA_VAT_RATE_PERCENT);
    expect(result.vatAmount).toBe(86.25);
    expect(result.stampLevyAmount).toBe(0);
    expect(result.grandTotal).toBe(1236.25);
  });

  it("includes the stamp levy amount in the grand total without taxing it", () => {
    const result = computeNigeriaHospitalityTaxes({
      roomTaxableBase: 1000,
      serviceChargeRatePercent: 0,
      stateLevyRatePercent: 0,
      stampLevyAmount: 50,
      exemptions: noExemptions,
    });

    expect(result.stampLevyAmount).toBe(50);
    expect(result.vatAmount).toBe(75);
    expect(result.grandTotal).toBe(1125);
  });

  it("zeroes out service charge when exemptServiceCharge is true", () => {
    const result = computeNigeriaHospitalityTaxes({
      roomTaxableBase: 1000,
      serviceChargeRatePercent: 10,
      stateLevyRatePercent: 5,
      exemptions: { ...noExemptions, exemptServiceCharge: true },
    });

    expect(result.serviceChargeAmount).toBe(0);
    expect(result.stateLevyAmount).toBe(50);
    // VAT now applies to base + state levy only = 1050
    expect(result.vatAmount).toBe(78.75);
    expect(result.grandTotal).toBe(1128.75);
  });

  it("zeroes out the state levy when exemptStateLevy is true", () => {
    const result = computeNigeriaHospitalityTaxes({
      roomTaxableBase: 1000,
      serviceChargeRatePercent: 10,
      stateLevyRatePercent: 5,
      exemptions: { ...noExemptions, exemptStateLevy: true },
    });

    expect(result.stateLevyAmount).toBe(0);
    expect(result.serviceChargeAmount).toBe(100);
    expect(result.vatAmount).toBe(82.5);
    expect(result.grandTotal).toBe(1182.5);
  });

  it("zeroes out VAT when exemptVat is true, even though the stack still includes service and state charges", () => {
    const result = computeNigeriaHospitalityTaxes({
      roomTaxableBase: 1000,
      serviceChargeRatePercent: 10,
      stateLevyRatePercent: 5,
      exemptions: { ...noExemptions, exemptVat: true },
    });

    expect(result.vatAmount).toBe(0);
    expect(result.grandTotal).toBe(1150);
  });

  it("zeroes out the stamp levy when exemptStampLevy is true, regardless of the supplied amount", () => {
    const result = computeNigeriaHospitalityTaxes({
      roomTaxableBase: 1000,
      serviceChargeRatePercent: 0,
      stateLevyRatePercent: 0,
      stampLevyAmount: 200,
      exemptions: { ...noExemptions, exemptStampLevy: true },
    });

    expect(result.stampLevyAmount).toBe(0);
    expect(result.grandTotal).toBe(1075);
  });

  it("applies every exemption at once to produce an untaxed grand total equal to the base", () => {
    const result = computeNigeriaHospitalityTaxes({
      roomTaxableBase: 1000,
      serviceChargeRatePercent: 10,
      stateLevyRatePercent: 5,
      stampLevyAmount: 200,
      exemptions: {
        exemptVat: true,
        exemptServiceCharge: true,
        exemptStateLevy: true,
        exemptStampLevy: true,
      },
    });

    expect(result.grandTotal).toBe(1000);
  });

  it("clamps a negative room taxable base to zero", () => {
    const result = computeNigeriaHospitalityTaxes({
      roomTaxableBase: -500,
      serviceChargeRatePercent: 10,
      stateLevyRatePercent: 5,
      exemptions: noExemptions,
    });

    expect(result.roomTaxableBase).toBe(0);
    expect(result.serviceChargeAmount).toBe(0);
    expect(result.stateLevyAmount).toBe(0);
    expect(result.vatAmount).toBe(0);
    expect(result.grandTotal).toBe(0);
  });

  it("clamps negative rate percentages to zero instead of crediting money back", () => {
    const result = computeNigeriaHospitalityTaxes({
      roomTaxableBase: 1000,
      serviceChargeRatePercent: -10,
      stateLevyRatePercent: -5,
      exemptions: noExemptions,
    });

    expect(result.serviceChargeAmount).toBe(0);
    expect(result.stateLevyAmount).toBe(0);
  });

  it("clamps a negative stamp levy amount to zero", () => {
    const result = computeNigeriaHospitalityTaxes({
      roomTaxableBase: 1000,
      serviceChargeRatePercent: 0,
      stateLevyRatePercent: 0,
      stampLevyAmount: -50,
      exemptions: noExemptions,
    });

    expect(result.stampLevyAmount).toBe(0);
  });

  it("rounds every monetary amount to 2 decimal places", () => {
    const result = computeNigeriaHospitalityTaxes({
      roomTaxableBase: 333.333,
      serviceChargeRatePercent: 7.5,
      stateLevyRatePercent: 3.33,
      exemptions: noExemptions,
    });

    for (const value of [
      result.roomTaxableBase,
      result.serviceChargeAmount,
      result.stateLevyAmount,
      result.vatAmount,
      result.stampLevyAmount,
      result.grandTotal,
    ]) {
      expect(Number.isInteger(value * 100)).toBe(true);
    }
  });

  it("defaults the stamp levy amount to zero when omitted", () => {
    const result = computeNigeriaHospitalityTaxes({
      roomTaxableBase: 1000,
      serviceChargeRatePercent: 0,
      stateLevyRatePercent: 0,
      exemptions: noExemptions,
    });

    expect(result.stampLevyAmount).toBe(0);
  });
});
