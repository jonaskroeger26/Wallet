#!/usr/bin/env node
/**
 * Discord Rich Presence — shows “Playing OwnWallet” (or your app name) in Discord while this
 * process runs. Uses Discord’s local IPC (Discord desktop must be open).
 *
 * Not available from the browser: the web wallet cannot talk to Discord directly.
 *
 * Setup:
 * 1. https://discord.com/developers/applications → New Application → name it (e.g. OwnWallet)
 * 2. Copy “Application ID” into DISCORD_CLIENT_ID in .env (this ID is public, not secret)
 * 3. Optional: Rich Presence → Art Assets → upload a 512×512 image, note the asset key (e.g. logo)
 * 4. npm run discord:presence   (or npm run dev:discord with the Vite dev server)
 */

import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import process from "node:process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, ".env") });

const require = createRequire(import.meta.url);
const { Client } = require("discord-rpc");

const clientId = process.env.DISCORD_CLIENT_ID?.trim();
if (!clientId) {
  console.error(
    "[discord-presence] Set DISCORD_CLIENT_ID in .env (Discord Developer Portal → Application ID)."
  );
  process.exit(1);
}

const details = process.env.DISCORD_PRESENCE_DETAILS?.trim() || "OwnWallet";
const state = process.env.DISCORD_PRESENCE_STATE?.trim() || "Working on Solana wallet";
const assetKey = process.env.DISCORD_ASSET_KEY?.trim();
const assetText = process.env.DISCORD_ASSET_TEXT?.trim() || "OwnWallet";

const rpc = new Client({ transport: "ipc" });

function buildActivity() {
  const activity = {
    details,
    state,
    startTimestamp: Date.now(),
    instance: false,
  };
  if (assetKey) {
    activity.largeImageKey = assetKey;
    activity.largeImageText = assetText;
  }
  return activity;
}

function pushActivity() {
  return rpc.setActivity(buildActivity()).catch((err) => {
    console.error("[discord-presence] setActivity:", err.message || err);
  });
}

rpc.on("ready", () => {
  console.log(`[discord-presence] Connected — showing “${details}” / “${state}”`);
  void pushActivity();
  setInterval(() => void pushActivity(), 15_000);
});

rpc.login({ clientId }).catch((err) => {
  console.error(
    "[discord-presence] Could not connect. Is the Discord desktop app running?\n",
    err?.message || err
  );
  process.exit(1);
});

function shutdown() {
  rpc
    .clearActivity()
    .catch(() => {})
    .finally(() => {
      rpc.destroy().catch(() => {});
      process.exit(0);
    });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
