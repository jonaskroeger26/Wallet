import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import type { DecryptedVault, VaultPayload } from "./vault";
import { mnemonicToKeypair } from "./mnemonic";
import { secretBase58ToKeypair } from "./wallet-key";

export { keypairToSecretBase58, secretBase58ToKeypair } from "./wallet-key";

export function vaultToKeypair(v: DecryptedVault, accountIndex?: number): Keypair {
  if (v.kind === "legacy") {
    return Keypair.fromSecretKey(v.secretKey);
  }
  if (v.kind === "secret") {
    return secretBase58ToKeypair(v.secretKeyB58);
  }
  return mnemonicToKeypair(v.mnemonic, accountIndex ?? v.accountIndex);
}

export function sessionToVaultPayload(
  mode: "mnemonic" | "secret",
  mnemonic: string | undefined,
  accountIndex: number,
  keypair: Keypair
): VaultPayload {
  if (mode === "mnemonic" && mnemonic) {
    return { v: 2, kind: "mnemonic", mnemonic, accountIndex };
  }
  return {
    v: 2,
    kind: "secret",
    secretKeyB58: bs58.encode(keypair.secretKey),
  };
}
