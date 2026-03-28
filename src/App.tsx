import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
  clusterApiUrl,
} from "@solana/web3.js";
import {
  clearVault,
  decryptVault,
  encryptVault,
  loadEncryptedVault,
  saveEncryptedVault,
} from "./lib/vault";
import {
  generateMnemonic12,
  mnemonicToKeypair,
  validateMnemonicPhrase,
} from "./lib/mnemonic";
import {
  keypairToSecretBase58,
  secretBase58ToKeypair,
  sessionToVaultPayload,
  vaultToKeypair,
} from "./lib/wallet";
import { fetchSplTokenRows, loadJupiterTokenMap } from "./lib/tokens";
import type { ParsedTokenRow } from "./lib/tokens";
import { sendSplToken } from "./lib/spl-transfer";
import { getQuote, getSwapTransaction, NATIVE_MINT_STR } from "./lib/jupiter";
import {
  loadAddressBook,
  saveAddressBook,
  type AddressBookEntry,
} from "./lib/address-book";
import { fetchRecentActivity } from "./lib/activity";
import { fetchNftsHelius } from "./lib/nfts";

type Cluster = "devnet" | "mainnet-beta";

const RPC: Record<Cluster, string> = {
  devnet: import.meta.env.VITE_SOLANA_RPC_DEVNET?.trim() || clusterApiUrl("devnet"),
  "mainnet-beta":
    import.meta.env.VITE_SOLANA_RPC_MAINNET?.trim() || clusterApiUrl("mainnet-beta"),
};

type Session =
  | { mode: "mnemonic"; mnemonic: string; accountIndex: number; keypair: Keypair }
  | { mode: "secret"; keypair: Keypair };

type Tab = "portfolio" | "tokens" | "swap" | "activity" | "nfts" | "settings";

const TABS: { id: Tab; label: string }[] = [
  { id: "portfolio", label: "Portfolio" },
  { id: "tokens", label: "Tokens" },
  { id: "swap", label: "Swap" },
  { id: "activity", label: "Activity" },
  { id: "nfts", label: "Collectibles" },
  { id: "settings", label: "Settings" },
];

export function App() {
  const [cluster, setCluster] = useState<Cluster>("devnet");
  const [tab, setTab] = useState<Tab>("portfolio");
  const [session, setSession] = useState<Session | null>(null);
  const [sessionPassword, setSessionPassword] = useState("");

  const [unlockPassword, setUnlockPassword] = useState("");
  const [password, setPassword] = useState("");
  const [importSecret, setImportSecret] = useState("");
  const [importMnemonic, setImportMnemonic] = useState("");
  const [pendingMnemonic, setPendingMnemonic] = useState<string | null>(null);
  const [backupConfirmed, setBackupConfirmed] = useState(false);

  const [balanceLamports, setBalanceLamports] = useState<number | null>(null);
  const [tokenRows, setTokenRows] = useState<ParsedTokenRow[]>([]);
  const [jupMeta, setJupMeta] = useState<
    Map<string, { symbol: string; name: string }>
  >(() => new Map());
  const [tokensBusy, setTokensBusy] = useState(false);
  const [activity, setActivity] = useState<
    Awaited<ReturnType<typeof fetchRecentActivity>>
  >([]);
  const [activityBusy, setActivityBusy] = useState(false);

  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [splMint, setSplMint] = useState("");
  const [splDest, setSplDest] = useState("");
  const [splAmount, setSplAmount] = useState("");

  const [swapInMint, setSwapInMint] = useState(NATIVE_MINT_STR);
  const [swapOutMint, setSwapOutMint] = useState("");
  const [swapAmount, setSwapAmount] = useState("");
  const [swapSlippageBps, setSwapSlippageBps] = useState(100);
  const [swapQuote, setSwapQuote] = useState<Record<string, unknown> | null>(null);
  const [swapBusy, setSwapBusy] = useState(false);

  const [addressBook, setAddressBook] = useState<AddressBookEntry[]>(() =>
    loadAddressBook()
  );
  const [abName, setAbName] = useState("");
  const [abAddr, setAbAddr] = useState("");

  const [nfts, setNfts] = useState<Awaited<ReturnType<typeof fetchNftsHelius>>>([]);
  const [nftsBusy, setNftsBusy] = useState(false);

  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [airdropBusy, setAirdropBusy] = useState(false);

  const connection = useMemo(() => new Connection(RPC[cluster], "confirmed"), [cluster]);
  const keypair = session?.keypair ?? null;
  const address = keypair ? keypair.publicKey.toBase58() : null;
  const heliusKey = import.meta.env.VITE_HELIUS_API_KEY?.trim();

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

  const refreshTokens = useCallback(async () => {
    if (!keypair) return;
    setTokensBusy(true);
    setError(null);
    try {
      const map = await loadJupiterTokenMap();
      setJupMeta(map);
      const rows = await fetchSplTokenRows(connection, keypair.publicKey);
      setTokenRows(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTokensBusy(false);
    }
  }, [connection, keypair]);

  const refreshActivity = useCallback(async () => {
    if (!keypair) return;
    setActivityBusy(true);
    setError(null);
    try {
      const rows = await fetchRecentActivity(connection, keypair.publicKey, 25);
      setActivity(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActivityBusy(false);
    }
  }, [connection, keypair]);

  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  useEffect(() => {
    if (tab === "tokens" && keypair) void refreshTokens();
  }, [tab, keypair, refreshTokens]);

  useEffect(() => {
    if (tab === "activity" && keypair) void refreshActivity();
  }, [tab, keypair, refreshActivity]);

  async function persistSession(next: Session, password: string) {
    const payload = sessionToVaultPayload(
      next.mode,
      next.mode === "mnemonic" ? next.mnemonic : undefined,
      next.mode === "mnemonic" ? next.accountIndex : 0,
      next.keypair
    );
    const b64 = await encryptVault(payload, password);
    saveEncryptedVault(b64);
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
      const decrypted = await decryptVault(vault, unlockPassword);
      const kp = vaultToKeypair(decrypted);
      if (decrypted.kind === "mnemonic") {
        setSession({
          mode: "mnemonic",
          mnemonic: decrypted.mnemonic,
          accountIndex: decrypted.accountIndex,
          keypair: kp,
        });
      } else {
        setSession({ mode: "secret", keypair: kp });
      }
      setSessionPassword(unlockPassword);
      setUnlockPassword("");
      setStatus("Unlocked.");
    } catch {
      setError("Wrong password or corrupted data.");
    }
  }

  async function handleCreateMnemonicContinue() {
    setError(null);
    setStatus(null);
    if (!pendingMnemonic || !password || password.length < 8) {
      setError("Use a password of at least 8 characters.");
      return;
    }
    if (!backupConfirmed) {
      setError("Confirm that you saved your recovery phrase.");
      return;
    }
    const kp = mnemonicToKeypair(pendingMnemonic, 0);
    const next: Session = {
      mode: "mnemonic",
      mnemonic: pendingMnemonic.trim().toLowerCase().replace(/\s+/g, " "),
      accountIndex: 0,
      keypair: kp,
    };
    await persistSession(next, password);
    setSession(next);
    setSessionPassword(password);
    setPendingMnemonic(null);
    setBackupConfirmed(false);
    setPassword("");
    setStatus("Wallet created. Your phrase is encrypted in this browser only.");
  }

  async function handleImportMnemonic() {
    setError(null);
    setStatus(null);
    if (!password || password.length < 8) {
      setError("Use a password of at least 8 characters.");
      return;
    }
    const phrase = importMnemonic.trim().toLowerCase().replace(/\s+/g, " ");
    if (!validateMnemonicPhrase(phrase)) {
      setError("Invalid recovery phrase.");
      return;
    }
    const kp = mnemonicToKeypair(phrase, 0);
    const next: Session = {
      mode: "mnemonic",
      mnemonic: phrase,
      accountIndex: 0,
      keypair: kp,
    };
    await persistSession(next, password);
    setSession(next);
    setSessionPassword(password);
    setImportMnemonic("");
    setPassword("");
    setStatus("Recovery phrase imported.");
  }

  async function handleImportSecret() {
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
    const next: Session = { mode: "secret", keypair: kp };
    await persistSession(next, password);
    setSession(next);
    setSessionPassword(password);
    setImportSecret("");
    setPassword("");
    setStatus("Private key imported.");
  }

  function startCreateMnemonic() {
    setError(null);
    setStatus(null);
    if (!password || password.length < 8) {
      setError("Use a password of at least 8 characters first.");
      return;
    }
    setPendingMnemonic(generateMnemonic12());
    setBackupConfirmed(false);
  }

  async function setAccountIndex(nextIndex: number) {
    if (!session || session.mode !== "mnemonic" || !sessionPassword) return;
    setError(null);
    setStatus(null);
    if (nextIndex < 0 || nextIndex > 19) return;
    const kp = mnemonicToKeypair(session.mnemonic, nextIndex);
    const next: Session = {
      mode: "mnemonic",
      mnemonic: session.mnemonic,
      accountIndex: nextIndex,
      keypair: kp,
    };
    await persistSession(next, sessionPassword);
    setSession(next);
    setStatus(`Switched to account ${nextIndex + 1}.`);
  }

  function handleLock() {
    setSession(null);
    setSessionPassword("");
    setBalanceLamports(null);
    setTokenRows([]);
    setActivity([]);
    setSwapQuote(null);
    setPendingMnemonic(null);
    setStatus(null);
    setError(null);
  }

  function handleForget() {
    clearVault();
    handleLock();
    setStatus("Saved wallet removed from this browser.");
  }

  async function copyAddress() {
    if (!address) return;
    setError(null);
    try {
      await navigator.clipboard.writeText(address);
      setStatus("Address copied.");
    } catch {
      setError("Could not copy (clipboard permission).");
    }
  }

  async function handleAirdrop() {
    if (!keypair || cluster !== "devnet") return;
    setError(null);
    setStatus(null);
    setAirdropBusy(true);
    try {
      const lamports = 1 * LAMPORTS_PER_SOL;
      const sig = await connection.requestAirdrop(keypair.publicKey, lamports);
      const latest = await connection.getLatestBlockhash();
      await connection.confirmTransaction({
        signature: sig,
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
      });
      setStatus(`Devnet airdrop received (1 SOL). Signature: ${sig}`);
      await refreshBalance();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAirdropBusy(false);
    }
  }

  async function handleSendSol() {
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

  async function handleSendSpl() {
    if (!keypair) return;
    setError(null);
    setStatus(null);
    let mint: PublicKey;
    let dest: PublicKey;
    try {
      mint = new PublicKey(splMint.trim());
      dest = new PublicKey(splDest.trim());
    } catch {
      setError("Invalid mint or destination.");
      return;
    }
    const row = tokenRows.find((r) => r.mint === mint.toBase58());
    if (!row || row.program !== "spl-token") {
      setError("Only standard SPL Token mints can be sent from this screen (not Token-2022 yet).");
      return;
    }
    const amt = Number(splAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    const raw = BigInt(Math.floor(amt * 10 ** row.decimals));
    if (raw > row.rawAmount) {
      setError("Amount exceeds balance.");
      return;
    }
    try {
      const sig = await sendSplToken({
        connection,
        payer: keypair,
        mint,
        destinationOwner: dest,
        amountRaw: raw,
      });
      setSplAmount("");
      setStatus(`SPL transfer sent. Signature: ${sig}`);
      await refreshTokens();
      await refreshBalance();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleQuote() {
    if (!keypair) return;
    setError(null);
    setStatus(null);
    setSwapQuote(null);
    if (cluster !== "mainnet-beta") {
      setError("Jupiter swap uses mainnet liquidity. Switch network to Mainnet-beta.");
      return;
    }
    let inputMint: string;
    let outputMint: string;
    try {
      inputMint = new PublicKey(swapInMint.trim()).toBase58();
      outputMint = new PublicKey(swapOutMint.trim()).toBase58();
    } catch {
      setError("Invalid mint addresses.");
      return;
    }
    const human = Number(swapAmount);
    if (!Number.isFinite(human) || human <= 0) {
      setError("Enter a valid amount (human units, e.g. SOL).");
      return;
    }
    let amountRaw: string;
    if (inputMint === NATIVE_MINT_STR) {
      amountRaw = String(Math.floor(human * LAMPORTS_PER_SOL));
    } else {
      const map = await loadJupiterTokenMap();
      const meta = map.get(inputMint);
      if (!meta) {
        setError("Unknown input mint — add a token that appears on Jupiter’s list.");
        return;
      }
      amountRaw = String(BigInt(Math.floor(human * 10 ** meta.decimals)));
    }
    setSwapBusy(true);
    try {
      const q = await getQuote({
        inputMint,
        outputMint,
        amount: amountRaw,
        slippageBps: swapSlippageBps,
      });
      setSwapQuote(q);
      setStatus("Quote ready — review and confirm swap.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSwapBusy(false);
    }
  }

  async function handleSwapConfirm() {
    if (!keypair || !swapQuote) return;
    setError(null);
    setStatus(null);
    setSwapBusy(true);
    try {
      const { swapTransaction } = await getSwapTransaction(
        swapQuote,
        keypair.publicKey.toBase58()
      );
      const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, "base64"));
      tx.sign([keypair]);
      const sig = await connection.sendRawTransaction(tx.serialize());
      const latest = await connection.getLatestBlockhash();
      await connection.confirmTransaction({
        signature: sig,
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
      });
      setStatus(`Swap submitted. Signature: ${sig}`);
      setSwapQuote(null);
      await refreshBalance();
      await refreshTokens();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSwapBusy(false);
    }
  }

  function addAddressBookEntry() {
    setError(null);
    try {
      new PublicKey(abAddr.trim());
    } catch {
      setError("Invalid address for address book.");
      return;
    }
    if (!abName.trim()) {
      setError("Enter a name.");
      return;
    }
    const next = [...addressBook, { name: abName.trim(), address: abAddr.trim() }];
    setAddressBook(next);
    saveAddressBook(next);
    setAbName("");
    setAbAddr("");
    setStatus("Contact saved.");
  }

  function removeAddressBookEntry(i: number) {
    const next = addressBook.filter((_, j) => j !== i);
    setAddressBook(next);
    saveAddressBook(next);
  }

  async function loadNfts() {
    if (!address || !heliusKey) return;
    setNftsBusy(true);
    setError(null);
    try {
      const list = await fetchNftsHelius(address, heliusKey);
      setNfts(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setNftsBusy(false);
    }
  }

  useEffect(() => {
    if (tab === "nfts" && keypair && heliusKey) void loadNfts();
  }, [tab, keypair, heliusKey, address]);

  const hasVault = Boolean(loadEncryptedVault());

  return (
    <div className="stack">
      <header className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <h1 style={{ margin: 0 }}>Wallet</h1>
        {keypair && (
          <span className="hint">
            {cluster === "devnet" ? "Devnet" : "Mainnet"}
          </span>
        )}
      </header>
      <p className="hint">
        Phantom-style web wallet: recovery phrase, multiple accounts, tokens, Jupiter swap, activity.
        Extension / mobile app parity is not included.
      </p>

      <div>
        <label htmlFor="cluster">Network</label>
        <select
          id="cluster"
          value={cluster}
          onChange={(e) => setCluster(e.target.value as Cluster)}
          disabled={Boolean(keypair)}
        >
          <option value="devnet">Devnet</option>
          <option value="mainnet-beta">Mainnet-beta</option>
        </select>
        {keypair && (
          <p className="hint" style={{ marginTop: "0.35rem" }}>
            Lock wallet to change network.
          </p>
        )}
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

          {!pendingMnemonic ? (
            <>
              <div className="stack">
                <button type="button" className="primary" onClick={startCreateMnemonic}>
                  Create new wallet (12-word phrase)
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
                  <label htmlFor="impPhrase">Import recovery phrase (12 words)</label>
                  <textarea
                    id="impPhrase"
                    rows={3}
                    value={importMnemonic}
                    onChange={(e) => setImportMnemonic(e.target.value)}
                    placeholder="word1 word2 …"
                  />
                </div>
                <div>
                  <label htmlFor="pwPhrase">Password</label>
                  <input
                    id="pwPhrase"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <button type="button" onClick={() => void handleImportMnemonic()}>
                  Import phrase and save
                </button>
              </div>

              <hr />

              <div className="stack">
                <div>
                  <label htmlFor="imp">Import private key (base58)</label>
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
                  <label htmlFor="pw2">Password</label>
                  <input
                    id="pw2"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <button type="button" onClick={() => void handleImportSecret()}>
                  Import private key and save
                </button>
              </div>
            </>
          ) : (
            <div className="stack">
              <p className="hint">
                Write these words down offline. Never share them. Anyone with the phrase can
                steal funds.
              </p>
              <div className="mono" style={{ lineHeight: 1.6 }}>
                {pendingMnemonic}
              </div>
              <label className="row">
                <input
                  type="checkbox"
                  checked={backupConfirmed}
                  onChange={(e) => setBackupConfirmed(e.target.checked)}
                />
                <span>I saved my recovery phrase in a safe place</span>
              </label>
              <div className="row">
                <button type="button" className="primary" onClick={() => void handleCreateMnemonicContinue()}>
                  Continue
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPendingMnemonic(null);
                    setBackupConfirmed(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {keypair && (
        <>
          <nav className="tabs">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={tab === t.id ? "tab active" : "tab"}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>

          {tab === "portfolio" && (
            <div className="stack">
              <div>
                <span className="hint">Address</span>
                <div className="mono">{address}</div>
                <div className="row" style={{ marginTop: "0.5rem" }}>
                  <button type="button" onClick={() => void copyAddress()}>
                    Copy address
                  </button>
                </div>
              </div>

              {session?.mode === "mnemonic" && (
                <div>
                  <label>Account (HD)</label>
                  <div className="row">
                    <button
                      type="button"
                      disabled={session.accountIndex <= 0}
                      onClick={() => void setAccountIndex(session.accountIndex - 1)}
                    >
                      Previous
                    </button>
                    <span>
                      Account {session.accountIndex + 1} (index {session.accountIndex})
                    </span>
                    <button
                      type="button"
                      disabled={session.accountIndex >= 19}
                      onClick={() => void setAccountIndex(session.accountIndex + 1)}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}

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

              {cluster === "devnet" && (
                <div className="stack">
                  <button
                    type="button"
                    disabled={airdropBusy}
                    onClick={() => void handleAirdrop()}
                  >
                    {airdropBusy ? "Requesting…" : "Request 1 SOL (devnet airdrop)"}
                  </button>
                </div>
              )}

              <div className="stack">
                <div>
                  <label htmlFor="to">Send SOL — recipient</label>
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
                <button type="button" className="primary" onClick={() => void handleSendSol()}>
                  Send SOL
                </button>
              </div>
            </div>
          )}

          {tab === "tokens" && (
            <div className="stack">
              <div className="row">
                <button type="button" disabled={tokensBusy} onClick={() => void refreshTokens()}>
                  {tokensBusy ? "Loading…" : "Refresh tokens"}
                </button>
              </div>
              {tokenRows.length === 0 && !tokensBusy && (
                <p className="hint">No token balances (or only zero balances).</p>
              )}
              <ul className="token-list">
                {tokenRows.map((r) => (
                  <li key={r.mint} className="token-row">
                    <div>
                      <div>
                        <strong>{jupMeta.get(r.mint)?.symbol ?? "Unknown"}</strong>{" "}
                        <span className="hint">{jupMeta.get(r.mint)?.name}</span>
                      </div>
                      <div className="mono hint">{r.mint}</div>
                      <div className="hint">
                        {r.amountUi} · {r.program}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              <hr />
              <p className="hint">Send SPL (standard Token program only)</p>
              <div>
                <label htmlFor="splMint">Mint address</label>
                <input id="splMint" className="mono" value={splMint} onChange={(e) => setSplMint(e.target.value)} />
              </div>
              <div>
                <label htmlFor="splDest">Recipient wallet</label>
                <input id="splDest" className="mono" value={splDest} onChange={(e) => setSplDest(e.target.value)} />
              </div>
              <div>
                <label htmlFor="splAmt">Amount (human)</label>
                <input id="splAmt" inputMode="decimal" value={splAmount} onChange={(e) => setSplAmount(e.target.value)} />
              </div>
              <button type="button" className="primary" onClick={() => void handleSendSpl()}>
                Send SPL token
              </button>
            </div>
          )}

          {tab === "swap" && (
            <div className="stack">
              <p className="hint">
                Jupiter routes on <strong>mainnet</strong>. Switch to Mainnet-beta and fund the wallet
                with real SOL before swapping.
              </p>
              <div>
                <label htmlFor="inMint">Input mint</label>
                <input
                  id="inMint"
                  className="mono"
                  value={swapInMint}
                  onChange={(e) => setSwapInMint(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="outMint">Output mint</label>
                <input
                  id="outMint"
                  className="mono"
                  value={swapOutMint}
                  onChange={(e) => setSwapOutMint(e.target.value)}
                  placeholder="Token mint address"
                />
              </div>
              <div>
                <label htmlFor="swapAmt">Amount (SOL if input is native mint)</label>
                <input
                  id="swapAmt"
                  inputMode="decimal"
                  value={swapAmount}
                  onChange={(e) => setSwapAmount(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="slip">Slippage (bps)</label>
                <input
                  id="slip"
                  type="number"
                  min={1}
                  max={5000}
                  value={swapSlippageBps}
                  onChange={(e) => setSwapSlippageBps(Number(e.target.value) || 100)}
                />
              </div>
              <div className="row">
                <button type="button" disabled={swapBusy} onClick={() => void handleQuote()}>
                  {swapBusy ? "…" : "Get quote"}
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={swapBusy || !swapQuote}
                  onClick={() => void handleSwapConfirm()}
                >
                  Confirm swap
                </button>
              </div>
              {swapQuote && (
                <details open>
                  <summary>Quote (raw)</summary>
                  <pre className="mono quote-pre">{JSON.stringify(swapQuote, null, 2)}</pre>
                </details>
              )}
            </div>
          )}

          {tab === "activity" && (
            <div className="stack">
              <div className="row">
                <button type="button" disabled={activityBusy} onClick={() => void refreshActivity()}>
                  {activityBusy ? "Loading…" : "Refresh"}
                </button>
              </div>
              <ul className="activity-list">
                {activity.map((row) => (
                  <li key={row.signature}>
                    <a
                      className="mono"
                      href={`https://solscan.io/tx/${row.signature}${cluster === "devnet" ? "?cluster=devnet" : ""}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {row.signature.slice(0, 12)}…
                    </a>
                    {row.err ? <span className="error"> failed</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {tab === "nfts" && (
            <div className="stack">
              {!heliusKey && (
                <p className="hint">
                  Add <code className="mono">VITE_HELIUS_API_KEY</code> to <code>.env</code> to load
                  collectibles (Helius).
                </p>
              )}
              {heliusKey && (
                <>
                  <button type="button" disabled={nftsBusy} onClick={() => void loadNfts()}>
                    {nftsBusy ? "Loading…" : "Reload collectibles"}
                  </button>
                  <div className="nft-grid">
                    {nfts.map((n) => (
                      <div key={n.id} className="nft-card">
                        {n.image ? (
                          <img src={n.image} alt="" className="nft-img" crossOrigin="anonymous" />
                        ) : (
                          <div className="nft-placeholder">No image</div>
                        )}
                        <div className="mono hint">{n.name ?? n.id.slice(0, 8)}</div>
                      </div>
                    ))}
                  </div>
                  {nfts.length === 0 && !nftsBusy && (
                    <p className="hint">No items returned (or none on this cluster).</p>
                  )}
                </>
              )}
            </div>
          )}

          {tab === "settings" && (
            <div className="stack">
              {session?.mode === "mnemonic" && (
                <details>
                  <summary>Show recovery phrase</summary>
                  <p className="hint">Never share or store this in cloud photos or chat apps.</p>
                  <div className="mono">{session.mnemonic}</div>
                </details>
              )}

              <details>
                <summary>Export private key (base58)</summary>
                <p className="hint">Anyone with this key controls this account.</p>
                <div className="mono">{keypairToSecretBase58(keypair)}</div>
              </details>

              <hr />

              <h2 style={{ fontSize: "1rem", margin: 0 }}>Address book</h2>
              <div className="row">
                <input
                  placeholder="Name"
                  value={abName}
                  onChange={(e) => setAbName(e.target.value)}
                />
                <input
                  placeholder="Solana address"
                  className="mono"
                  value={abAddr}
                  onChange={(e) => setAbAddr(e.target.value)}
                />
                <button type="button" onClick={addAddressBookEntry}>
                  Save contact
                </button>
              </div>
              <ul className="ab-list">
                {addressBook.map((e, i) => (
                  <li key={e.address + i} className="row ab-item">
                    <span>{e.name}</span>
                    <span className="mono">{e.address.slice(0, 6)}…</span>
                    <button type="button" onClick={() => removeAddressBookEntry(i)}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>

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
        </>
      )}

      {error && <p className="error">{error}</p>}
      {status && <p className="success">{status}</p>}
    </div>
  );
}
