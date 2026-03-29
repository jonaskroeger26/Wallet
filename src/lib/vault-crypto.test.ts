import { describe, expect, it } from "vitest";
import { encryptSecret, decryptSecret } from "./vault-crypto";

describe("vault-crypto", () => {
  it("round-trips bytes with password", async () => {
    const plain = new TextEncoder().encode('{"v":2,"kind":"secret","secretKeyB58":"test"}');
    const enc = await encryptSecret(plain, "correct horse battery staple");
    const out = await decryptSecret(enc, "correct horse battery staple");
    expect(new TextDecoder().decode(out)).toBe(new TextDecoder().decode(plain));
  });

  it("fails with wrong password", async () => {
    const plain = new TextEncoder().encode("secret");
    const enc = await encryptSecret(plain, "password-one");
    await expect(decryptSecret(enc, "password-two")).rejects.toThrow();
  });
});
