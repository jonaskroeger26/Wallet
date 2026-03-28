const STORAGE_KEY = "wallet.v1";

const enc = {
  encode(data: Uint8Array): string {
    let s = "";
    for (let i = 0; i < data.length; i++) s += String.fromCharCode(data[i]!);
    return btoa(s);
  },
};

const dec = {
  decode(b64: string): Uint8Array {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },
};

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
    "deriveBits",
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 210_000,
      hash: "SHA-256",
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptSecret(secret: Uint8Array, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, secret)
  );
  const payload = new Uint8Array(salt.length + iv.length + ct.length);
  payload.set(salt, 0);
  payload.set(iv, salt.length);
  payload.set(ct, salt.length + iv.length);
  return enc.encode(payload);
}

export async function decryptSecret(payloadB64: string, password: string): Promise<Uint8Array> {
  const payload = dec.decode(payloadB64);
  const salt = payload.slice(0, 16);
  const iv = payload.slice(16, 28);
  const ct = payload.slice(28);
  const key = await deriveKey(password, salt);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new Uint8Array(pt);
}

export function saveEncryptedVault(b64: string): void {
  localStorage.setItem(STORAGE_KEY, b64);
}

export function loadEncryptedVault(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function clearVault(): void {
  localStorage.removeItem(STORAGE_KEY);
}
