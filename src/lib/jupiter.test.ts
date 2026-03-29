import { describe, expect, it } from "vitest";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { humanToRawAmount, NATIVE_MINT_STR, rawToUiAmount, USDC_MINT_MAINNET } from "./jupiter";

describe("jupiter helpers", () => {
  it("humanToRawAmount for native SOL", () => {
    const meta = new Map<string, { decimals: number }>();
    expect(humanToRawAmount(NATIVE_MINT_STR, 1, meta)).toBe(String(LAMPORTS_PER_SOL));
  });

  it("humanToRawAmount for SPL uses decimals", () => {
    const meta = new Map<string, { decimals: number }>();
    meta.set(USDC_MINT_MAINNET, { decimals: 6 });
    expect(humanToRawAmount(USDC_MINT_MAINNET, 2.5, meta)).toBe("2500000");
  });

  it("humanToRawAmount throws for unknown SPL mint", () => {
    const meta = new Map<string, { decimals: number }>();
    expect(() => humanToRawAmount("UnknownMint1111111111111111111111111111111", 1, meta)).toThrow(
      /Unknown input token/
    );
  });

  it("rawToUiAmount formats base units", () => {
    expect(rawToUiAmount("1500000", 6)).toBe("1.5");
    expect(rawToUiAmount("1000000000", 9)).toBe("1");
  });
});
