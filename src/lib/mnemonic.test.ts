import { describe, expect, it } from "vitest";
import { generateMnemonic12, mnemonicToKeypair, validateMnemonicPhrase } from "./mnemonic";

describe("mnemonic", () => {
  it("generates and validates a 12-word phrase", () => {
    const m = generateMnemonic12();
    expect(m.split(/\s+/).length).toBe(12);
    expect(validateMnemonicPhrase(m)).toBe(true);
  });

  it("rejects garbage", () => {
    expect(validateMnemonicPhrase("not a real phrase at all")).toBe(false);
  });

  it("derives the same keypair for the same phrase and index", () => {
    const m = generateMnemonic12();
    const a = mnemonicToKeypair(m, 0);
    const b = mnemonicToKeypair(m, 0);
    expect(a.publicKey.toBase58()).toBe(b.publicKey.toBase58());
  });

  it("derives different accounts for different indices", () => {
    const m = generateMnemonic12();
    const a = mnemonicToKeypair(m, 0);
    const b = mnemonicToKeypair(m, 1);
    expect(a.publicKey.toBase58()).not.toBe(b.publicKey.toBase58());
  });
});
