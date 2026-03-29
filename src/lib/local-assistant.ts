/**
 * Offline “assistant” — no API keys, no network, no cost.
 * Uses keyword / phrase matching over curated wallet + Solana knowledge.
 * Extend KNOWLEDGE below to add more answers (this is the practical alternative
 * to training a custom model for a small app).
 */

export type LocalAssistantContext = {
  address: string;
  addressShort: string;
  cluster: string;
  clusterLabel: string;
  balanceSol: string | null;
  tokenCount: number;
  sessionMode: "mnemonic" | "secret" | null;
};

type Entry = {
  /** Single words or short tokens to match inside the question (lowercased). */
  keywords: string[];
  /** Bonus: full substrings (lowercased). */
  phrases?: string[];
  /** Static text; use {{placeholders}} for context. */
  template: string;
};

const KNOWLEDGE: Entry[] = [
  {
    keywords: ["devnet", "mainnet", "difference", "testnet", "network"],
    phrases: ["devnet vs", "which network"],
    template: `**Devnet** is Solana’s public test network: fake SOL from faucets, no real money.\n\n**Mainnet-beta** is the real network: real SOL and tokens, real fees.\n\nYou’re on **{{clusterLabel}}**. To switch networks, lock the wallet and pick Devnet or Mainnet when unlocking.`,
  },
  {
    keywords: ["swap", "jupiter", "trade", "exchange"],
    phrases: ["how to swap", "swap tokens"],
    template: `Swaps use **Jupiter** (aggregated liquidity) and only work on **Mainnet-beta** in this app.\n\nOpen **Swap**, pick tokens, enter an amount, set slippage (0.5% is common), review the quote, then confirm. Always verify token symbols and mints — anyone can create tokens with misleading names.`,
  },
  {
    keywords: ["mainnet", "swap", "only", "why"],
    phrases: ["swap say mainnet", "jupiter devnet"],
    template: `Jupiter’s liquidity pools live on **mainnet**. There is no Jupiter route on Devnet the same way, so this wallet only enables swaps when you’re on **Mainnet-beta** (with real SOL for fees).`,
  },
  {
    keywords: ["slippage", "bps", "price impact"],
    template: `**Slippage** is how much worse than the quoted price you’re willing to accept (e.g. 0.5% = 50 bps). Higher slippage can help in volatile pools but increases risk of a bad fill. Start low; raise only if swaps fail.`,
  },
  {
    keywords: ["seed", "phrase", "recovery", "mnemonic", "12 words", "share"],
    phrases: ["never share", "give away phrase"],
    template: `**Never** share your 12-word recovery phrase or private key with anyone, any site, or any “support” person. They can drain your wallet.\n\nThis assistant runs **only in your browser** — don’t paste secrets into chat. If you think your phrase was exposed, move funds to a **new** wallet with a new phrase.`,
  },
  {
    keywords: ["private", "key", "secret", "paste"],
    template: `Don’t paste private keys or seed phrases into websites, Discord, or chat bots. This app never needs your phrase after you’ve imported or created the wallet in this browser.`,
  },
  {
    keywords: ["account", "accounts", "20", "multiple", "index"],
    phrases: ["why 20", "hd wallet"],
    template: `One recovery phrase can derive **many** addresses (standard path \`m/44'/501'/index'/0'\`). This wallet lets you switch **Account 1–20** (indices 0–19) — same phrase, different public addresses. Use one account for daily use and others for organizing funds if you like.`,
  },
  {
    keywords: ["fee", "fees", "sol", "transaction"],
    phrases: ["network fee", "gas"],
    template: `Solana fees are small SOL payments to validators (not a separate “gas token”). You need enough **SOL** in the paying account to cover rent-exempt minimums for new accounts plus the transaction fee. On swaps, leave a little extra SOL for priority fees if the network is busy.`,
  },
  {
    keywords: ["send", "sol", "transfer"],
    phrases: ["send sol", "how send"],
    template: `On **Dashboard**, use **Send SOL**: paste the recipient’s **public address**, enter an amount, confirm. Double-check the address — Solana transactions are irreversible.`,
  },
  {
    keywords: ["spl", "token", "mint"],
    phrases: ["send token", "erc20"],
    template: `**SPL tokens** are Solana’s fungible tokens (like ERC-20 on Ethereum). In **Assets**, see balances; **Send SPL** asks for mint, recipient, and amount. This screen supports standard Token program mints (Token-2022 with extra features may be limited).`,
  },
  {
    keywords: ["receive", "deposit", "address"],
    phrases: ["my address", "copy address"],
    template: `Your **public address** is safe to share — it’s how people send you SOL/tokens. Use **Copy** on the dashboard or top bar. Never share your **private** key or seed phrase.`,
  },
  {
    keywords: ["nft", "nfts", "collectible", "helius"],
    template: `The **NFTs** tab can list collectibles if \`VITE_HELIUS_API_KEY\` is set (Helius DAS-style API). Without it, you’ll see a hint to configure the key. NFTs are separate token accounts on-chain.`,
  },
  {
    keywords: ["rpc", "slow", "failed", "error"],
    phrases: ["transaction failed"],
    template: `Failed or slow txs can be RPC congestion, slippage too low, or insufficient SOL. Retry with a higher priority fee (wallet RPC settings), adjust slippage on swaps, or check **Activity** for errors. Devnet faucets can rate-limit.`,
  },
  {
    keywords: ["lock", "logout", "session"],
    template: `**Lock** clears the session from memory (you’ll need your password or saved vault again if you use one). **Forget wallet** removes saved data from this browser — back up your phrase first.`,
  },
  {
    keywords: ["phishing", "scam", "fake", "drain"],
    template: `Watch for fake airdrop sites, “verify wallet” prompts, and copied addresses in clipboard malware. Always verify URLs and contract/mint addresses on a block explorer. This assistant will never ask for your seed.`,
  },
  {
    keywords: ["airdrop", "faucet", "devnet"],
    phrases: ["free sol"],
    template: `On **Devnet**, you can request test SOL from the **Dashboard** faucet button (when available). That SOL has **no real value** — only for testing.`,
  },
  {
    keywords: ["bridge", "ethereum", "eth"],
    template: `Moving assets between chains usually uses a **bridge** or centralized exchange — not this wallet alone. Research the official bridge; never share keys to “bridge support”.`,
  },
  {
    keywords: ["password", "encrypt", "vault"],
    template: `You can save an **encrypted** vault with a password (older flows) or a **plain** save in the browser. Encrypted is safer if someone uses your device — but if you forget the password, recovery needs your phrase.`,
  },
  {
    keywords: ["assistant", "ai", "how work", "offline"],
    phrases: ["how does this work", "no api"],
    template: `This **local assistant** runs entirely in your browser: answers come from **built-in knowledge** (keyword matching), not from a cloud model — **no API keys and no per-request cost**. You can add more Q&A by editing the knowledge list in the app source.`,
  },
];

const MIN_SCORE = 4;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’]/g, "'")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function applyTemplate(tpl: string, ctx: LocalAssistantContext): string {
  const bal = ctx.balanceSol ?? "unknown (refresh balance)";
  const mode =
    ctx.sessionMode === "mnemonic"
      ? "12-word HD wallet (multiple accounts)"
      : ctx.sessionMode === "secret"
        ? "imported private key"
        : "unknown";
  return tpl
    .replace(/\{\{address\}\}/g, ctx.address)
    .replace(/\{\{addressShort\}\}/g, ctx.addressShort)
    .replace(/\{\{cluster\}\}/g, ctx.cluster)
    .replace(/\{\{clusterLabel\}\}/g, ctx.clusterLabel)
    .replace(/\{\{balanceSol\}\}/g, bal)
    .replace(/\{\{tokenCount\}\}/g, String(ctx.tokenCount))
    .replace(/\{\{sessionMode\}\}/g, mode);
}

/** Convert **bold** markdown-lite to readable plain (keep simple). */
function formatAnswer(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, "$1");
}

function fallback(ctx: LocalAssistantContext): string {
  return [
    `I don’t have a specific article for that yet. This assistant is **offline** — it matches your question to built-in wallet help (no cloud AI).`,
    ``,
    `**Your context:** ${ctx.addressShort} · ${ctx.clusterLabel} · ~${ctx.balanceSol ?? "…"} SOL · ${ctx.tokenCount} SPL token position(s).`,
    ``,
    `Try: Devnet vs Mainnet, Jupiter swaps, slippage, multiple accounts from one phrase, sending SOL/SPL, or security. Use the quick prompts below.`,
  ].join("\n");
}

export function getLocalAssistantReply(question: string, ctx: LocalAssistantContext): string {
  const q = normalize(question);
  if (!q) return fallback(ctx);

  let bestScore = 0;
  let bestTemplate = "";

  for (const entry of KNOWLEDGE) {
    let score = 0;
    for (const kw of entry.keywords) {
      const k = kw.toLowerCase();
      if (q.includes(k)) score += k.length >= 4 ? 4 : 2;
    }
    for (const ph of entry.phrases ?? []) {
      if (q.includes(ph.toLowerCase())) score += 8;
    }
    if (score > bestScore) {
      bestScore = score;
      bestTemplate = entry.template;
    }
  }

  if (bestScore >= MIN_SCORE && bestTemplate) {
    return formatAnswer(applyTemplate(bestTemplate, ctx));
  }
  return formatAnswer(fallback(ctx));
}
