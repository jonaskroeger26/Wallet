import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  clusterApiUrl,
} from "@solana/web3.js";
import {
  clearVault,
  decryptSecret,
  encryptSecret,
  loadEncryptedVault,
  saveEncryptedVault,
} from "./lib/vault";
import { keypairToSecretBase58, secretBase58ToKeypair } from "./lib/wallet";

type Cluster = "devnet" | "mainnet-beta";

const RPC: Record<Cluster, string> = {
  devnet: clusterApiUrl("devnet"),
  "mainnet-beta": clusterApiUrl("mainnet-beta"),
};

export function App() {
  const [cluster, setCluster] = useState<Cluster>("devnet");
  const [password, setPassword] = useState("");
  const [unlockPassword, setUnlockPassword] = useState("");
  const [importSecret, setImportSecret] = useState("");
  const [keypair, setKeypair] = useState<Keypair | null>(null);
  const [balanceLamports, setBalanceLamports] = useState<number | null>(null);
  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connection = useMemo(() => new Connection(RPC[cluster], "confirmed"), [cluster]);

  const refreshBalance = useCallback(async () => {
    if (!keypair) return;
    setError(null);
    try {
      const lamports = await connection.getBalance(keypair.publicKey);
      setBalanceLamports(lamports);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [connection, keypair]);

  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  const address = keypair ? keypair.publicKey.toBase58() : null;

  async function handleCreate() {
    setError(null);
    setStatus(null);
    if (!password || password.length < 8) {
      setError("Use a password of at least 8 characters.");
      return;
    }
    const kp = Keypair.generate();
    const b64 = await encryptSecret(kp.secretKey, password);
    saveEncryptedVault(b64);
    setKeypair(kp);
    setPassword("");
    setStatus("New wallet created and encrypted in this browser.");
  }

  async function handleImport() {
    setError(null);
    setStatus(null);
    if (!password || password.length < 8) {
      setError("Use a password of at least 8 characters.");
      return;
    }
    let kp: Keypair;
    try {
      kp = secretBase58ToKeypair(importSecret.trim());
    } catch {
      setError("Invalid secret key (base58).");
      return;
    }
    const b64 = await encryptSecret(kp.secretKey, password);
    saveEncryptedVault(b64);
    setKeypair(kp);
    setImportSecret("");
    setPassword("");
    setStatus("Imported wallet saved (encrypted).");
  }

  async function handleUnlock() {
    setError(null);
    setStatus(null);
    const vault = loadEncryptedVault();
    if (!vault) {
      setError("No saved wallet.");
      return;
    }
    try {
      const secret = await decryptSecret(vault, unlockPassword);
      setKeypair(Keypair.fromSecretKey(secret));
      setUnlockPassword("");
      setStatus("Unlocked.");
    } catch {
      setError("Wrong password or corrupted data.");
    }
  }

  function handleLock() {
    setKeypair(null);
    setBalanceLamports(null);
    setStatus(null);
    setError(null);
  }

  function handleForget() {
    clearVault();
    handleLock();
    setStatus("Saved wallet removed from this browser.");
  }

  async function handleSend() {
    if (!keypair) return;
    setError(null);
    setStatus(null);
    let dest: PublicKey;
    try {
      dest = new PublicKey(sendTo.trim());
    } catch {
      setError("Invalid recipient address.");
      return;
    }
    const sol = Number(sendAmount);
    if (!Number.isFinite(sol) || sol <= 0) {
      setError("Enter a valid SOL amount.");
      return;
    }
    const lamports = Math.floor(sol * LAMPORTS_PER_SOL);
    try {
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: keypair.publicKey,
          toPubkey: dest,
          lamports,
        })
      );
      tx.feePayer = keypair.publicKey;
      tx.recentBlockhash = blockhash;
      tx.sign(keypair);
      const sig = await connection.sendRawTransaction(tx.serialize());
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight });
      setSendAmount("");
      setStatus(`Sent. Signature: ${sig}`);
      await refreshBalance();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const hasVault = Boolean(loadEncryptedVault());

  return (
    <div className="stack">
      <h1>Wallet</h1>
      <p className="hint">
        Devnet-first Solana wallet. Keys stay in your browser, encrypted with your password.
      </p>

      <div>
        <label htmlFor="cluster">Network</label>
        <select
          id="cluster"
          value={cluster}
          onChange={(e) => setCluster(e.target.value as Cluster)}
        >
          <option value="devnet">Devnet</option>
          <option value="mainnet-beta">Mainnet-beta</option>
        </select>
      </div>

      {!keypair && (
        <>
          {hasVault && (
            <div className="stack">
              <div>
                <label htmlFor="unlock">Password</label>
                <input
                  id="unlock"
                  type="password"
                  autoComplete="current-password"
                  value={unlockPassword}
                  onChange={(e) => setUnlockPassword(e.target.value)}
                />
              </div>
              <button type="button" className="primary" onClick={() => void handleUnlock()}>
                Unlock saved wallet
              </button>
            </div>
          )}

          <hr />

          <div className="stack">
            <button type="button" className="primary" onClick={() => void handleCreate()}>
              Create new wallet
            </button>
            <div>
              <label htmlFor="pw1">Password (encrypt vault)</label>
              <input
                id="pw1"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <hr />

          <div className="stack">
            <div>
              <label htmlFor="imp">Import secret key (base58)</label>
              <textarea
                id="imp"
                rows={3}
                className="mono"
                value={importSecret}
                onChange={(e) => setImportSecret(e.target.value)}
                placeholder="Paste private key"
              />
            </div>
            <div>
              <label htmlFor="pw2">Password (encrypt vault)</label>
              <input
                id="pw2"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button type="button" onClick={() => void handleImport()}>
              Import and save
            </button>
          </div>
        </>
      )}

      {keypair && (
        <div className="stack">
          <div>
            <span className="hint">Address</span>
            <div className="mono">{address}</div>
          </div>
          <div className="row">
            <button type="button" onClick={() => void refreshBalance()}>
              Refresh balance
            </button>
            <span>
              {balanceLamports === null
                ? "…"
                : `${(balanceLamports / LAMPORTS_PER_SOL).toFixed(6)} SOL`}
            </span>
          </div>

          <div className="stack">
            <div>
              <label htmlFor="to">Send to (address)</label>
              <input id="to" value={sendTo} onChange={(e) => setSendTo(e.target.value)} />
            </div>
            <div>
              <label htmlFor="amt">Amount (SOL)</label>
              <input
                id="amt"
                inputMode="decimal"
                value={sendAmount}
                onChange={(e) => setSendAmount(e.target.value)}
              />
            </div>
            <button type="button" className="primary" onClick={() => void handleSend()}>
              Send SOL
            </button>
          </div>

          <details>
            <summary>Export secret key</summary>
            <p className="hint">Anyone with this key controls the wallet. Never share it.</p>
            <div className="mono">{keypairToSecretBase58(keypair)}</div>
          </details>

          <div className="row">
            <button type="button" onClick={handleLock}>
              Lock
            </button>
            <button type="button" className="danger" onClick={handleForget}>
              Forget saved wallet
            </button>
          </div>
        </div>
      )}

      {error && <p className="error">{error}</p>}
      {status && <p className="success">{status}</p>}
    </div>
  );
}
