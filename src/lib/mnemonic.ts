import { Keypair } from "@solana/web3.js";
import * as bip39 from "bip39";
import { derivePath } from "ed25519-hd-key";

/** Phantom-style path: m/44'/501'/account'/0' */
export function mnemonicToKeypair(mnemonic: string, accountIndex: number): Keypair {
  const normalized = mnemonic.trim().toLowerCase().replace(/\s+/g, " ");
  const seed = bip39.mnemonicToSeedSync(normalized);
  const path = `m/44'/501'/${accountIndex}'/0'`;
  const { key } = derivePath(path, Buffer.from(seed).toString("hex"));
  const seed32 = Uint8Array.from(key).slice(0, 32);
  return Keypair.fromSeed(seed32);
}

export function generateMnemonic12(): string {
  return bip39.generateMnemonic(128);
}

export function validateMnemonicPhrase(phrase: string): boolean {
  const normalized = phrase.trim().toLowerCase().replace(/\s+/g, " ");
  return bip39.validateMnemonic(normalized);
}
