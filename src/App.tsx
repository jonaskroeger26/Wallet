import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  clearEncryptedVaultStorage,
  clearPlainVault,
  clearVault,
  decryptVault,
  encryptVault,
  loadEncryptedVault,
  loadPlainVault,
  saveEncryptedVault,
  savePlainVault,
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
import type { Cluster } from "./lib/cluster";
import { WalletShell, type ShellTab } from "./components/WalletShell";
import { PortfolioHero } from "./components/PortfolioHero";

const RPC: Record<Cluster, string> = {
  devnet: import.meta.env.VITE_SOLANA_RPC_DEVNET?.trim() || clusterApiUrl("devnet"),
  "mainnet-beta":
    import.meta.env.VITE_SOLANA_RPC_MAINNET?.trim() || clusterApiUrl("mainnet-beta"),
};

type Session =
  | { mode: "mnemonic"; mnemonic: string; accountIndex: number; keypair: Keypair }
  | { mode: "secret"; keypair: Keypair };

export function App() {
  const [cluster, setCluster] = useState<Cluster>("devnet");
  const [tab, setTab] = useState<ShellTab>("portfolio");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [addressCopied, setAddressCopied] = useState(false);
  const sendSolSectionRef = useRef<HTMLDivElement | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [sessionPassword, setSessionPassword] = useState("");

  const [unlockPassword, setUnlockPassword] = useState("");
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

  /**
   * @param passwordOverride `null` = save plain (no password). `undefined` = use `sessionPassword` state.
   */
  async function persistSession(next: Session, passwordOverride?: string | null) {
    const payload = sessionToVaultPayload(
      next.mode,
      next.mode === "mnemonic" ? next.mnemonic : undefined,
      next.mode === "mnemonic" ? next.accountIndex : 0,
      next.keypair
    );
    const pwd =
      passwordOverride !== undefined ? passwordOverride : sessionPassword;
    if (pwd) {
      saveEncryptedVault(await encryptVault(payload, pwd));
      clearPlainVault();
    } else {
      savePlainVault(payload);
      clearEncryptedVaultStorage();
    }
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
      clearPlainVault();
      setUnlockPassword("");
      setStatus("Unlocked.");
    } catch {
      setError("Wrong password or corrupted data.");
    }
  }

  function handleOpenPlainWallet() {
    setError(null);
    setStatus(null);
    const vault = loadPlainVault();
    if (!vault) {
      setError("No saved wallet.");
      return;
    }
    try {
      const kp = vaultToKeypair(vault);
      if (vault.kind === "mnemonic") {
        setSession({
          mode: "mnemonic",
          mnemonic: vault.mnemonic,
          accountIndex: vault.accountIndex,
          keypair: kp,
        });
      } else {
        setSession({ mode: "secret", keypair: kp });
      }
      setSessionPassword("");
      setStatus("Wallet loaded.");
    } catch {
      setError("Could not read saved wallet.");
    }
  }

  async function handleCreateMnemonicContinue() {
    setError(null);
    setStatus(null);
    if (!pendingMnemonic) {
      setError("Missing recovery phrase.");
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
    await persistSession(next, null);
    setSession(next);
    setSessionPassword("");
    setPendingMnemonic(null);
    setBackupConfirmed(false);
    setStatus("Wallet created and saved in this browser. Password protection can be added later.");
  }

  async function handleImportMnemonic() {
    setError(null);
    setStatus(null);
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
    await persistSession(next, null);
    setSession(next);
    setSessionPassword("");
    setImportMnemonic("");
    setStatus("Recovery phrase imported.");
  }

  async function handleImportSecret() {
    setError(null);
    setStatus(null);
    let kp: Keypair;
    try {
      kp = secretBase58ToKeypair(importSecret.trim());
    } catch {
      setError("Invalid secret key (base58).");
      return;
    }
    const next: Session = { mode: "secret", keypair: kp };
    await persistSession(next, null);
    setSession(next);
    setSessionPassword("");
    setImportSecret("");
    setStatus("Private key imported.");
  }

  function startCreateMnemonic() {
    setError(null);
    setStatus(null);
    setPendingMnemonic(generateMnemonic12());
    setBackupConfirmed(false);
  }

  async function setAccountIndex(nextIndex: number) {
    if (!session || session.mode !== "mnemonic") return;
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
    await persistSession(next);
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
      setAddressCopied(true);
      window.setTimeout(() => setAddressCopied(false), 2000);
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

  const hasEncryptedVault = Boolean(loadEncryptedVault());
  const hasPlainVault = Boolean(loadPlainVault());

  const balanceSolStr =
    balanceLamports === null
      ? "—"
      : (balanceLamports / LAMPORTS_PER_SOL).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 6,
        });

  return (
    <div className={keypair ? "app app--shell" : "app"}>
      <div className="app__ambient" aria-hidden />
      <div className="app__grid" aria-hidden />
      <div className="app__inner">
        {!keypair && (
        <header className="app-header">
          <div className="app-header__brand">
            <div className="app-header__logo" aria-hidden />
            <div className="app-header__titles">
              <h1>Wallet</h1>
              <p className="tagline">
                Self-custody Solana in your browser. Keys stay on this device; optional password later.
              </p>
            </div>
          </div>
        </header>
        )}

        {!keypair ? (
        <main className="app-main">
        <div className="card card--network">
          <div className="field">
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
              <p className="hint" style={{ marginTop: "0.5rem", marginBottom: 0 }}>
                Lock your wallet to switch networks.
              </p>
            )}
          </div>
        </div>

          <>
          {hasEncryptedVault && (
            <div className="card stack mt-gap">
              <div className="section-title">Unlock (password-protected)</div>
              <p className="hint" style={{ margin: 0 }}>
                This device has an older encrypted vault. Enter the password you set when saving it.
              </p>
              <div className="field">
                <label htmlFor="unlock">Password</label>
                <input
                  id="unlock"
                  type="password"
                  autoComplete="current-password"
                  value={unlockPassword}
                  onChange={(e) => setUnlockPassword(e.target.value)}
                />
              </div>
              <button type="button" className="primary btn-block" onClick={() => void handleUnlock()}>
                Unlock wallet
              </button>
            </div>
          )}

          {hasPlainVault && !hasEncryptedVault && (
            <div className="card stack mt-gap">
              <div className="section-title">Saved wallet</div>
              <p className="hint" style={{ margin: 0 }}>
                Open the wallet stored in this browser (no password on file yet).
              </p>
              <button type="button" className="primary btn-block" onClick={handleOpenPlainWallet}>
                Open wallet
              </button>
            </div>
          )}

          {!pendingMnemonic ? (
            <>
              <div className="card stack mt-gap">
                <div className="section-title">New wallet</div>
                <p className="hint" style={{ margin: 0 }}>
                  Creates a real Solana keypair from a 12-word phrase. Saved locally without a password for now.
                </p>
                <button type="button" className="primary btn-block" onClick={startCreateMnemonic}>
                  Create wallet
                </button>
              </div>

              <div className="card stack mt-gap">
                <div className="section-title">Import recovery phrase</div>
                <div className="field">
                  <label htmlFor="impPhrase">12 words</label>
                  <textarea
                    id="impPhrase"
                    rows={3}
                    value={importMnemonic}
                    onChange={(e) => setImportMnemonic(e.target.value)}
                    placeholder="word1 word2 word3 …"
                  />
                </div>
                <button type="button" className="btn-block" onClick={() => void handleImportMnemonic()}>
                  Import phrase
                </button>
              </div>

              <div className="card stack mt-gap">
                <div className="section-title">Import private key</div>
                <div className="field">
                  <label htmlFor="imp">Base58 secret key</label>
                  <textarea
                    id="imp"
                    rows={3}
                    className="mono"
                    value={importSecret}
                    onChange={(e) => setImportSecret(e.target.value)}
                    placeholder="Paste private key"
                  />
                </div>
                <button type="button" className="btn-block" onClick={() => void handleImportSecret()}>
                  Import key
                </button>
              </div>
            </>
          ) : (
            <div className="card stack mt-gap">
              <div className="section-title">Back up recovery phrase</div>
              <p className="hint" style={{ margin: 0 }}>
                Write these words offline. Never share them. Anyone with the phrase can move your
                funds.
              </p>
              <div className="mnemonic-box">{pendingMnemonic}</div>
              <label className="check">
                <input
                  type="checkbox"
                  checked={backupConfirmed}
                  onChange={(e) => setBackupConfirmed(e.target.checked)}
                />
                <span>I have saved my recovery phrase in a safe place</span>
              </label>
              <div className="btn-group btn-group--stretch">
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
        </main>
        ) : (
          address && (
          <WalletShell
            activeTab={tab}
            onTabChange={setTab}
            address={address}
            copied={addressCopied}
            onCopyAddress={() => void copyAddress()}
            cluster={cluster}
            onClusterChange={setCluster}
            networkDisabled
            sidebarCollapsed={sidebarCollapsed}
            onToggleSidebar={() => setSidebarCollapsed((c) => !c)}
          >
          {tab === "portfolio" && (
            <div className="stack" style={{ gap: "0.75rem" }}>
              <PortfolioHero
                balanceSol={balanceSolStr}
                balanceLoading={balanceLamports === null}
                clusterLabel={cluster === "devnet" ? "Devnet" : "Mainnet-beta"}
                onSend={() =>
                  sendSolSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
                onReceive={() => void copyAddress()}
                onSwap={() => setTab("swap")}
                onRefresh={() => void refreshBalance()}
              />
              <div className="card card--flush">
                <div className="card__body">
                  <div className="section-title">Receiving address</div>
                  <div className="address-chip">
                    <div className="address-chip__text">{address}</div>
                    <button type="button" onClick={() => void copyAddress()}>
                      Copy
                    </button>
                  </div>
                  <div className="row" style={{ marginTop: "0.65rem" }}>
                    <button type="button" className="btn-ghost" onClick={() => void refreshBalance()}>
                      Refresh balance
                    </button>
                  </div>
                </div>
              </div>

              {session?.mode === "mnemonic" && (
                <div className="card">
                  <div className="section-title">Accounts</div>
                  <div className="stepper">
                    <button
                      type="button"
                      disabled={session.accountIndex <= 0}
                      onClick={() => void setAccountIndex(session.accountIndex - 1)}
                    >
                      ←
                    </button>
                    <span className="stepper__meta">
                      Account {session.accountIndex + 1}
                      <span className="hint"> · index {session.accountIndex}</span>
                    </span>
                    <button
                      type="button"
                      disabled={session.accountIndex >= 19}
                      onClick={() => void setAccountIndex(session.accountIndex + 1)}
                    >
                      →
                    </button>
                  </div>
                </div>
              )}

              {cluster === "devnet" && (
                <div className="card">
                  <div className="section-title">Devnet</div>
                  <button
                    type="button"
                    className="btn-block"
                    disabled={airdropBusy}
                    onClick={() => void handleAirdrop()}
                  >
                    {airdropBusy ? "Requesting…" : "Request 1 SOL from faucet"}
                  </button>
                </div>
              )}

              <div className="card" ref={sendSolSectionRef}>
                <div className="section-title">Send SOL</div>
                <div className="field">
                  <label htmlFor="to">Recipient</label>
                  <input
                    id="to"
                    className="mono"
                    value={sendTo}
                    onChange={(e) => setSendTo(e.target.value)}
                    placeholder="Solana address"
                  />
                </div>
                <div className="field">
                  <label htmlFor="amt">Amount</label>
                  <input
                    id="amt"
                    inputMode="decimal"
                    value={sendAmount}
                    onChange={(e) => setSendAmount(e.target.value)}
                    placeholder="0.0"
                  />
                </div>
                <button type="button" className="primary btn-block" onClick={() => void handleSendSol()}>
                  Send
                </button>
              </div>
            </div>
          )}

          {tab === "tokens" && (
            <div className="stack" style={{ gap: "0.75rem" }}>
              <div className="card">
                <div className="flex-spread">
                  <div className="section-title" style={{ margin: 0 }}>
                    Assets
                  </div>
                  <button type="button" className="btn-ghost" disabled={tokensBusy} onClick={() => void refreshTokens()}>
                    {tokensBusy ? "Loading…" : "Refresh"}
                  </button>
                </div>
                {tokenRows.length === 0 && !tokensBusy && (
                  <p className="empty-state">No tokens yet. Fund the wallet or receive SPL.</p>
                )}
                <ul className="token-list">
                  {tokenRows.map((r) => {
                    const meta = jupMeta.get(r.mint);
                    const sym = meta?.symbol ?? "?";
                    return (
                      <li key={r.mint} className="token-row">
                        <div className="token-avatar" aria-hidden>
                          {sym.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="token-row__body">
                          <div>
                            <strong>{meta?.symbol ?? "Unknown"}</strong>{" "}
                            <span className="hint">{meta?.name}</span>
                          </div>
                          <div className="mono hint">{r.mint}</div>
                          <div className="hint">
                            {r.amountUi} · {r.program}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="card">
                <div className="section-title">Send SPL</div>
                <p className="hint" style={{ marginTop: 0 }}>
                  Standard Token program only (not Token-2022 extensions).
                </p>
                <div className="field">
                  <label htmlFor="splMint">Mint</label>
                  <input id="splMint" className="mono" value={splMint} onChange={(e) => setSplMint(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="splDest">Recipient</label>
                  <input id="splDest" className="mono" value={splDest} onChange={(e) => setSplDest(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="splAmt">Amount</label>
                  <input id="splAmt" inputMode="decimal" value={splAmount} onChange={(e) => setSplAmount(e.target.value)} />
                </div>
                <button type="button" className="primary btn-block" onClick={() => void handleSendSpl()}>
                  Send token
                </button>
              </div>
            </div>
          )}

          {tab === "swap" && (
            <div className="card stack">
              <p className="hint" style={{ margin: 0 }}>
                Jupiter aggregates mainnet liquidity. Use <strong>Mainnet-beta</strong> and real SOL.
              </p>
              <div className="field">
                <label htmlFor="inMint">Input mint</label>
                <input
                  id="inMint"
                  className="mono"
                  value={swapInMint}
                  onChange={(e) => setSwapInMint(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="outMint">Output mint</label>
                <input
                  id="outMint"
                  className="mono"
                  value={swapOutMint}
                  onChange={(e) => setSwapOutMint(e.target.value)}
                  placeholder="Token mint"
                />
              </div>
              <div className="field">
                <label htmlFor="swapAmt">Amount (SOL units if input is native mint)</label>
                <input
                  id="swapAmt"
                  inputMode="decimal"
                  value={swapAmount}
                  onChange={(e) => setSwapAmount(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="slip">Slippage (basis points)</label>
                <input
                  id="slip"
                  type="number"
                  min={1}
                  max={5000}
                  value={swapSlippageBps}
                  onChange={(e) => setSwapSlippageBps(Number(e.target.value) || 100)}
                />
              </div>
              <div className="btn-group btn-group--stretch">
                <button type="button" disabled={swapBusy} onClick={() => void handleQuote()}>
                  {swapBusy ? "…" : "Quote"}
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={swapBusy || !swapQuote}
                  onClick={() => void handleSwapConfirm()}
                >
                  Swap
                </button>
              </div>
              {swapQuote && (
                <details open>
                  <summary>Raw quote</summary>
                  <div className="details-body">
                    <pre className="mono quote-pre">{JSON.stringify(swapQuote, null, 2)}</pre>
                  </div>
                </details>
              )}
            </div>
          )}

          {tab === "activity" && (
            <div className="card">
              <div className="flex-spread">
                <div className="section-title" style={{ margin: 0 }}>
                  Recent activity
                </div>
                <button type="button" className="btn-ghost" disabled={activityBusy} onClick={() => void refreshActivity()}>
                  {activityBusy ? "Loading…" : "Refresh"}
                </button>
              </div>
              <ul className="activity-list">
                {activity.map((row) => (
                  <li key={row.signature}>
                    <a
                      href={`https://solscan.io/tx/${row.signature}${cluster === "devnet" ? "?cluster=devnet" : ""}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {row.signature.slice(0, 10)}…{row.signature.slice(-6)}
                    </a>
                    {row.err ? (
                      <span className="activity-status error">Failed</span>
                    ) : (
                      <span className="activity-status success">Done</span>
                    )}
                  </li>
                ))}
              </ul>
              {activity.length === 0 && !activityBusy && (
                <p className="empty-state" style={{ padding: "1rem 0" }}>
                  No transactions yet.
                </p>
              )}
            </div>
          )}

          {tab === "nfts" && (
            <div className="card stack">
              {!heliusKey && (
                <p className="hint" style={{ margin: 0 }}>
                  Set <code>VITE_HELIUS_API_KEY</code> in <code>.env</code> to load collectibles via Helius.
                </p>
              )}
              {heliusKey && (
                <>
                  <div className="flex-spread">
                    <div className="section-title" style={{ margin: 0 }}>
                      Collectibles
                    </div>
                    <button type="button" className="btn-ghost" disabled={nftsBusy} onClick={() => void loadNfts()}>
                      {nftsBusy ? "Loading…" : "Reload"}
                    </button>
                  </div>
                  <div className="nft-grid">
                    {nfts.map((n) => (
                      <div key={n.id} className="nft-card">
                        {n.image ? (
                          <img src={n.image} alt="" className="nft-img" crossOrigin="anonymous" />
                        ) : (
                          <div className="nft-placeholder">No preview</div>
                        )}
                        <div className="mono hint">{n.name ?? n.id.slice(0, 8)}</div>
                      </div>
                    ))}
                  </div>
                  {nfts.length === 0 && !nftsBusy && (
                    <p className="empty-state" style={{ padding: "1rem 0" }}>
                      No NFTs found for this address.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {tab === "ai" && (
            <div className="card wallet-ai-placeholder">
              <div className="section-title">AI Assistant</div>
              <p className="hint" style={{ margin: 0 }}>
                Coming soon — context-aware help for balances, swaps, and safety tips.
              </p>
            </div>
          )}

          {tab === "settings" && (
            <div className="stack" style={{ gap: "0.75rem" }}>
              {session?.mode === "mnemonic" && (
                <details>
                  <summary>Recovery phrase</summary>
                  <div className="details-body">
                    <p className="hint" style={{ marginTop: 0 }}>
                      Never share or store in cloud photos or chat apps.
                    </p>
                    <div className="mnemonic-box">{session.mnemonic}</div>
                  </div>
                </details>
              )}

              <details>
                <summary>Private key</summary>
                <div className="details-body">
                  <p className="hint" style={{ marginTop: 0 }}>
                    Anyone with this key controls this account.
                  </p>
                  <div className="mono" style={{ fontSize: "0.72rem" }}>
                    {keypairToSecretBase58(keypair)}
                  </div>
                </div>
              </details>

              <div className="card">
                <div className="section-title">Contacts</div>
                <div className="field">
                  <label htmlFor="abName">Name</label>
                  <input
                    id="abName"
                    placeholder="Label"
                    value={abName}
                    onChange={(e) => setAbName(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="abAddr">Address</label>
                  <input
                    id="abAddr"
                    placeholder="Solana address"
                    className="mono"
                    value={abAddr}
                    onChange={(e) => setAbAddr(e.target.value)}
                  />
                </div>
                <button type="button" className="primary btn-block" onClick={addAddressBookEntry}>
                  Save contact
                </button>
                <ul className="ab-list mt-gap">
                  {addressBook.map((e, i) => (
                    <li key={e.address + i} className="row ab-item">
                      <span style={{ fontWeight: 600 }}>{e.name}</span>
                      <span className="mono hint">{e.address.slice(0, 4)}…{e.address.slice(-4)}</span>
                      <button type="button" className="btn-ghost" onClick={() => removeAddressBookEntry(i)}>
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="card">
                <div className="section-title">Session</div>
                <div className="btn-group btn-group--stretch">
                  <button type="button" onClick={handleLock}>
                    Lock
                  </button>
                  <button type="button" className="danger" onClick={handleForget}>
                    Forget wallet
                  </button>
                </div>
              </div>
            </div>
          )}
          </WalletShell>
          )
        )}

        <div className="toast-stack" role="status" aria-live="polite">
          {error && <div className="toast toast--error">{error}</div>}
          {status && <div className="toast toast--success">{status}</div>}
        </div>
      </div>
    </div>
  );
}
