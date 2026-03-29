import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Send, Sparkles, Trash2 } from "lucide-react";
import type { Cluster } from "../lib/cluster";
import { clearStoredMessages, loadStoredMessages, saveStoredMessages, type ChatMessage } from "../lib/ai-chat";
import { getLocalAssistantReply, type LocalAssistantContext } from "../lib/local-assistant";

const QUICK_PROMPTS = [
  "What’s the difference between Devnet and Mainnet?",
  "How do I swap tokens safely?",
  "What should I never share with anyone?",
  "Why does my swap say mainnet only?",
  "How does this assistant work without an API?",
];

type Props = {
  cluster: Cluster;
  publicAddress: string;
  balanceLamports: number | null;
  tokenCount: number;
  sessionMode: "mnemonic" | "secret" | null;
};

export function AiAssistant({
  cluster,
  publicAddress,
  balanceLamports,
  tokenCount,
  sessionMode,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadStoredMessages());
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    saveStoredMessages(messages);
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const balanceSol =
    balanceLamports == null
      ? null
      : (balanceLamports / LAMPORTS_PER_SOL).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 6,
        });

  const assistantContext = useMemo<LocalAssistantContext>(
    () => ({
      address: publicAddress,
      addressShort: `${publicAddress.slice(0, 4)}…${publicAddress.slice(-4)}`,
      cluster,
      clusterLabel: cluster === "devnet" ? "Devnet" : "Mainnet-beta",
      balanceSol,
      tokenCount,
      sessionMode,
    }),
    [publicAddress, cluster, balanceSol, tokenCount, sessionMode]
  );

  const sendUserMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const userMsg: ChatMessage = { role: "user", content: trimmed };
      setMessages((m) => [...m, userMsg]);
      setInput("");

      queueMicrotask(() => {
        const reply = getLocalAssistantReply(trimmed, assistantContext);
        setMessages((m) => [...m, { role: "assistant", content: reply }]);
      });
    },
    [assistantContext]
  );

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    sendUserMessage(input);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendUserMessage(input);
    }
  }

  return (
    <div className="ai-assistant">
      <div className="ai-assistant__hero gradient-border glass noise">
        <div className="ai-assistant__hero-inner">
          <div className="ai-assistant__icon-wrap animated-gradient glow-primary-sm">
            <Sparkles className="ai-assistant__icon" strokeWidth={2} />
          </div>
          <div>
            <h2 className="ai-assistant__title gradient-text">Wallet assistant</h2>
            <p className="ai-assistant__subtitle">
              Runs <strong>offline</strong> in your browser — curated Solana &amp; wallet answers, no API
              keys and no usage fees. Not a trained neural model: you can extend it by editing the
              knowledge list in <code className="mono">src/lib/local-assistant.ts</code>. Never paste
              seeds or private keys anywhere.
            </p>
          </div>
        </div>
      </div>

      <div className="ai-assistant__messages card">
        <div className="ai-assistant__toolbar">
          <span className="section-title" style={{ margin: 0 }}>
            Chat
          </span>
          <button
            type="button"
            className="btn-ghost ai-assistant__clear"
            onClick={() => {
              clearStoredMessages();
              setMessages([]);
            }}
            aria-label="Clear chat"
          >
            <Trash2 className="w-4 h-4" strokeWidth={2} />
            Clear
          </button>
        </div>

        {messages.length === 0 && (
          <div className="ai-assistant__empty">
            <p className="hint">Try a quick question:</p>
            <div className="ai-assistant__chips">
              {QUICK_PROMPTS.map((q) => (
                <button
                  key={q}
                  type="button"
                  className="ai-assistant__chip"
                  onClick={() => sendUserMessage(q)}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        <ul className="ai-assistant__list" aria-live="polite">
          {messages.map((m, i) => (
            <li
              key={i}
              className={m.role === "user" ? "ai-assistant__bubble ai-assistant__bubble--user" : "ai-assistant__bubble"}
            >
              <span className="ai-assistant__role">{m.role === "user" ? "You" : "Assistant"}</span>
              <div className="ai-assistant__content">{m.content}</div>
            </li>
          ))}
        </ul>
        <div ref={bottomRef} />
      </div>

      <form className="ai-assistant__form card" onSubmit={onSubmit}>
        <label htmlFor="ai-input" className="sr-only">
          Message
        </label>
        <textarea
          id="ai-input"
          className="ai-assistant__input"
          rows={2}
          placeholder="Ask about Solana, this wallet, swaps, security…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button type="submit" className="primary ai-assistant__send" disabled={!input.trim()}>
          <Send className="w-4 h-4" strokeWidth={2} />
          Send
        </button>
      </form>

      <div className="ai-assistant__tips card">
        <div className="section-title">Safety reminders</div>
        <ul className="ai-assistant__tips-list">
          <li>Never share your recovery phrase or private key with anyone or any website.</li>
          <li>This assistant cannot move funds; approve transactions only in your wallet UI.</li>
          <li>On Mainnet, swaps use Jupiter — double-check token mints and slippage.</li>
        </ul>
      </div>
    </div>
  );
}
