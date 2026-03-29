import { describe, expect, it } from "vitest";
import { getLocalAssistantReply, type LocalAssistantContext } from "./local-assistant";

const baseCtx = (): LocalAssistantContext => ({
  address: "SoL11111111111111111111111111111111111111112",
  addressShort: "SoL1…1112",
  cluster: "devnet",
  clusterLabel: "Devnet",
  balanceSol: "1.5",
  tokenCount: 2,
  sessionMode: "mnemonic",
});

describe("local assistant", () => {
  it("answers devnet vs mainnet questions", () => {
    const r = getLocalAssistantReply("What is the difference between devnet and mainnet?", baseCtx());
    expect(r.toLowerCase()).toMatch(/devnet/);
    expect(r.toLowerCase()).toMatch(/mainnet/);
  });

  it("answers swap / Jupiter", () => {
    const r = getLocalAssistantReply("How do I swap tokens with Jupiter?", baseCtx());
    expect(r.toLowerCase()).toMatch(/jupiter|swap/);
  });

  it("answers security / seed phrase", () => {
    const r = getLocalAssistantReply("Should I share my seed phrase?", baseCtx());
    expect(r.toLowerCase()).toMatch(/never|not|don|phrase|share/);
  });

  it("returns fallback for unknown gibberish", () => {
    const r = getLocalAssistantReply("asdf qwerty zxcv", baseCtx());
    expect(r.toLowerCase()).toMatch(/offline|built-in|rephrasing/);
  });
});
