import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

export function keypairToSecretBase58(kp: Keypair): string {
  return bs58.encode(kp.secretKey);
}

export function secretBase58ToKeypair(secret: string): Keypair {
  const raw = bs58.decode(secret);
  return Keypair.fromSecretKey(raw);
}
