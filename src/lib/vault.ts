import { encryptSecret, decryptSecret } from "./vault-crypto";

export { encryptSecret, decryptSecret } from "./vault-crypto";

const STORAGE_PRIMARY = "wallet.store";
const STORAGE_LEGACY = "wallet.v1";
/** Unencrypted JSON vault (password protection can be added later). */
export const STORAGE_PLAIN = "wallet.plain.v1";

export type VaultPayload =
  | { v: 2; kind: "mnemonic"; mnemonic: string; accountIndex: number }
  | { v: 2; kind: "secret"; secretKeyB58: string };

export type DecryptedVault =
  | VaultPayload
  | { kind: "legacy"; secretKey: Uint8Array };

export async function encryptVault(payload: VaultPayload, password: string): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  return encryptSecret(bytes, password);
}

export async function decryptVault(b64: string, password: string): Promise<DecryptedVault> {
  const raw = await decryptSecret(b64, password);
  const text = new TextDecoder().decode(raw).trim();
  if (text.startsWith("{")) {
    const parsed = JSON.parse(text) as VaultPayload;
    if (parsed.v !== 2) throw new Error("Unsupported vault version.");
    return parsed;
  }
  if (raw.length === 64) {
    return { kind: "legacy", secretKey: raw };
  }
  throw new Error("Unrecognized vault data.");
}

export function loadEncryptedVault(): string | null {
  return localStorage.getItem(STORAGE_PRIMARY) ?? localStorage.getItem(STORAGE_LEGACY);
}

export function saveEncryptedVault(b64: string): void {
  localStorage.setItem(STORAGE_PRIMARY, b64);
  localStorage.removeItem(STORAGE_LEGACY);
}

export function savePlainVault(payload: VaultPayload): void {
  localStorage.setItem(STORAGE_PLAIN, JSON.stringify(payload));
}

export function loadPlainVault(): VaultPayload | null {
  const raw = localStorage.getItem(STORAGE_PLAIN);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as VaultPayload;
    if (p.v !== 2) return null;
    return p;
  } catch {
    return null;
  }
}

export function clearPlainVault(): void {
  localStorage.removeItem(STORAGE_PLAIN);
}

/** Remove password-encrypted vault blobs only (plain wallet untouched). */
export function clearEncryptedVaultStorage(): void {
  localStorage.removeItem(STORAGE_PRIMARY);
  localStorage.removeItem(STORAGE_LEGACY);
}

export function clearVault(): void {
  localStorage.removeItem(STORAGE_PRIMARY);
  localStorage.removeItem(STORAGE_LEGACY);
  clearPlainVault();
}
