/**
 * WhatsApp Manager via Baileys (@whiskeysockets/baileys).
 *
 * Supports:
 *  1. One-click Dashboard QR pairing & status check
 *  2. Disconnect / Re-link
 *  3. WhatsApp Alerts for Orders & Catalog Sync
 *  4. Natural Language WhatsApp Commands from Owner:
 *     Owner can text anything:
 *       "bhai aaj ads chalaye hain to m10 pe delivery free hai"
 *       "aaj se delivery 150 kardo"
 *       "offer band kardo"
 *       "status"
 *     The AI understands naturally and updates its salesperson behavior!
 */

import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type WASocket,
} from "@whiskeysockets/baileys";
import { existsSync } from "fs";
import { mkdir, readdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";
import pino from "pino";
import QRCode from "qrcode";
import { getCampaign, getOrders, getMeta } from "./store";
import { loadCatalog } from "./catalog";
import { processOwnerInstruction } from "./agent";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const AUTH_DIR = path.join(DATA_DIR, "baileys-auth");
const OWNER_WHATSAPP = process.env.OWNER_WHATSAPP || "923162975195";

export type WAConnectionStatus =
  | "disconnected"
  | "connecting"
  | "qr_ready"
  | "connected";

interface WAGlobalState {
  sock: WASocket | null;
  status: WAConnectionStatus;
  rawQR: string | null;
  qrDataUrl: string | null;
  phone: string | null;
  pairingInProgress: boolean;
  initPromise: Promise<WASocket> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var __dastiyabWA: WAGlobalState | undefined;
}

const state: WAGlobalState = globalThis.__dastiyabWA || {
  sock: null,
  status: "disconnected",
  rawQR: null,
  qrDataUrl: null,
  phone: null,
  pairingInProgress: false,
  initPromise: null,
};
globalThis.__dastiyabWA = state;

/** 0316XXXXXXXX → 92316XXXXXXXX@s.whatsapp.net */
export function normalizeJid(to: string): string {
  const trimmed = to.trim();
  if (trimmed.endsWith("@s.whatsapp.net") || trimmed.endsWith("@lid")) {
    return trimmed;
  }
  let digits = trimmed.replace(/\D/g, "");
  if (/^0\d{10}$/.test(digits)) {
    digits = "92" + digits.slice(1);
  }
  return `${digits}@s.whatsapp.net`;
}

/** Extract plain phone digits from JID */
export function extractPhone(jid: string): string {
  return jid.replace(/@.*$/, "").replace(/\D/g, "");
}

/** Check if session is authenticated on disk or env */
export async function isWhatsAppLinked(): Promise<boolean> {
  await restoreCredsFromEnv().catch(() => {});
  const credsPath = path.join(AUTH_DIR, "creds.json");
  if (!existsSync(credsPath)) return false;
  try {
    const creds = JSON.parse(await readFile(credsPath, "utf-8"));
    return creds?.registered === true;
  } catch {
    return false;
  }
}

async function restoreCredsFromEnv(): Promise<void> {
  const b64 = process.env.WA_CREDS_JSON;
  if (!b64 || existsSync(path.join(AUTH_DIR, "creds.json"))) return;
  try {
    const files = JSON.parse(
      Buffer.from(b64, "base64").toString("utf-8")
    ) as Record<string, unknown>;
    await mkdir(AUTH_DIR, { recursive: true });
    for (const [name, content] of Object.entries(files)) {
      if (!/^[\w.\-]+$/.test(name)) continue;
      await writeFile(path.join(AUTH_DIR, name), JSON.stringify(content));
    }
  } catch (err) {
    console.error("WA_CREDS_JSON could not be decoded:", err);
  }
}

export async function exportCredsForEnv(): Promise<string> {
  const map: Record<string, unknown> = {};
  if (!existsSync(AUTH_DIR)) return "";
  for (const f of await readdir(AUTH_DIR)) {
    if (!/^[\w.\-]+$/.test(f)) continue;
    try {
      map[f] = JSON.parse(await readFile(path.join(AUTH_DIR, f), "utf-8"));
    } catch {
      /* ignore */
    }
  }
  return Buffer.from(JSON.stringify(map)).toString("base64");
}

/** Handle incoming messages from the Store Owner */
async function handleIncomingMessage(sock: WASocket, msg: any): Promise<void> {
  if (!msg.message) return;

  const senderJid = msg.key.remoteJid || "";
  const senderPhone = extractPhone(senderJid);
  const ownerClean = extractPhone(OWNER_WHATSAPP);
  const myPhone = sock.user?.id ? extractPhone(sock.user.id) : "";

  // Support both:
  // 1) Self-chat ("Message yourself" / Note to Self on WhatsApp)
  // 2) Direct incoming message from the owner's phone number
  const isSelfChat = Boolean(msg.key.fromMe && (senderPhone === ownerClean || senderPhone === myPhone));
  const isIncomingFromOwner = Boolean(!msg.key.fromMe && (senderPhone === ownerClean || senderPhone === myPhone));

  if (!isSelfChat && !isIncomingFromOwner) return;

  const text =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    "";
  const trimmed = text.trim();
  if (!trimmed) return;

  console.log(`📩 Owner WhatsApp command received from ${senderPhone}: "${trimmed}"`);

  const lower = trimmed.toLowerCase();

  // 1. Status Command
  if (lower === "#status" || lower === "status") {
    const campaign = await getCampaign();
    const catalog = await loadCatalog();
    const orders = await getOrders(5);
    const meta = await getMeta();

    const statusMsg = [
      `📊 *Dastiyab Store AI Status*`,
      ``,
      `🔹 *WhatsApp:* Connected ✅`,
      `🔹 *Active Promo:* ${campaign.active ? "🟢 ON" : "🔴 OFF"}`,
      `🔹 *Current Pitch:* "${campaign.announcement}"`,
      campaign.customInstructions
        ? `🔹 *Instructions:* "${campaign.customInstructions}"`
        : ``,
      `🔹 *Updated via:* ${campaign.updatedVia} (${new Date(campaign.updatedAt).toLocaleTimeString()})`,
      `🔹 *Catalog:* ${catalog.filter((p) => p.inStock).length} in-stock products`,
      `🔹 *Recent Orders:* ${orders.length} orders recorded`,
      `🔹 *Last DM check:* ${meta.lastCheck ? new Date(meta.lastCheck).toLocaleTimeString() : "Never"}`,
    ]
      .filter(Boolean)
      .join("\n");

    await sock.sendMessage(senderJid, { text: statusMsg });
    return;
  }

  // 2. Help Command
  if (lower === "#help" || lower === "help") {
    const helpMsg = [
      `🤖 *Dastiyab AI Assistant — Voice & Text Help*`,
      ``,
      `Aap mujhe aam zuban mein koi bhi hidayat bhej sakte hain:`,
      `👉 _"bhai aaj ads chalaye hain to M10 aur P9 par delivery free kardo"_\n` +
      `👉 _"aaj se delivery charges 150 hain"_\n` +
      `👉 _"offer band kardo abhi normal chalao"_\n` +
      `👉 _"status"_`,
      ``,
      `Main aapki baat samajh kar foran customers ke DMs mein us hisaab se baat karunga!`,
    ].join("\n");
    await sock.sendMessage(senderJid, { text: helpMsg });
    return;
  }

  // 3. ANY free-form message from owner -> Process with AI!
  try {
    const result = await processOwnerInstruction(trimmed, "whatsapp");
    const replyText = [
      result.replyToOwner,
      ``,
      `📌 *Active Pitch:* "${result.campaign.announcement}"`,
      `⚙️ *Status:* ${result.campaign.active ? "🟢 Active" : "🔴 Inactive"}`,
    ].join("\n");

    await sock.sendMessage(senderJid, { text: replyText });
  } catch (err) {
    console.error("Failed to process owner instruction via LLM:", err);
    await sock.sendMessage(senderJid, {
      text: `⚠️ *Update failed:* Could not process instruction: ${String(err).slice(0, 100)}`,
    });
  }
}

/** Initialize or retrieve active WhatsApp socket */
export async function getActiveWASocket(): Promise<WASocket> {
  if (state.sock && (state.status === "connected" || (state.status === "qr_ready" && state.qrDataUrl))) {
    return state.sock;
  }

  if (state.initPromise) {
    return state.initPromise;
  }

  state.initPromise = (async () => {
    try {
      await restoreCredsFromEnv().catch(() => {});
      await mkdir(AUTH_DIR, { recursive: true });
      const { state: authState, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

      let version: [number, number, number] | undefined;
      try {
        const fetched = await fetchLatestBaileysVersion();
        version = fetched.version as [number, number, number];
      } catch {
        /* fallback to bundled */
      }

      state.status = "connecting";

      const sock = makeWASocket({
        version,
        auth: authState,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        browser: Browsers.windows("Desktop"),
        connectTimeoutMs: 60_000,
        defaultQueryTimeoutMs: 60_000,
        keepAliveIntervalMs: 15_000,
      });

      state.sock = sock;

      sock.ev.on("creds.update", saveCreds);

      sock.ev.on("connection.update", async (update) => {
        if (update.qr) {
          state.rawQR = update.qr;
          state.status = "qr_ready";
          try {
            state.qrDataUrl = await QRCode.toDataURL(update.qr, {
              width: 280,
              margin: 1,
            });
            console.log("✅ Baileys QR Code Data URL ready for scan!");
          } catch (err) {
            console.error("QR Code conversion error:", err);
          }
        }

        if (update.connection === "open") {
          state.status = "connected";
          state.rawQR = null;
          state.qrDataUrl = null;
          state.phone = sock.user?.id ? extractPhone(sock.user.id) : null;
          console.log("✅ WhatsApp connected successfully as:", state.phone);
        }

        if (update.connection === "close") {
          const statusCode = (
            update.lastDisconnect?.error as {
              output?: { statusCode?: number };
            } | undefined
          )?.output?.statusCode;

          state.rawQR = null;
          state.qrDataUrl = null;
          state.sock = null;
          state.status = "disconnected";
          state.initPromise = null;

          if (statusCode === DisconnectReason.loggedOut) {
            state.phone = null;
            console.log("⚠️ WhatsApp logged out.");
          }
        }
      });

      // Listen for incoming messages from owner
      sock.ev.on("messages.upsert", async ({ messages }) => {
        for (const m of messages) {
          try {
            await handleIncomingMessage(sock, m);
          } catch (err) {
            console.error("Error processing incoming WhatsApp message:", err);
          }
        }
      });

      return sock;
    } finally {
      state.initPromise = null;
    }
  })();

  return state.initPromise;
}

function waitForOpen(sock: WASocket, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (sock.user) return resolve();
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        reject(new Error("WhatsApp connection timeout"));
      }
    }, timeoutMs);

    sock.ev.on("connection.update", (u) => {
      if (!done && u.connection === "open") {
        done = true;
        clearTimeout(timer);
        resolve();
      }
    });
  });
}

/** Get current status for the dashboard */
export async function getWhatsAppStatus(): Promise<{
  linked: boolean;
  status: WAConnectionStatus;
  qrDataUrl: string | null;
  phone: string | null;
}> {
  console.log("getWhatsAppStatus called! state:", {
    status: state.status,
    hasSock: !!state.sock,
    hasQr: !!state.qrDataUrl,
    hasInitPromise: !!state.initPromise,
  });
  const linked = await isWhatsAppLinked();
  if (linked) {
    if (!state.sock || state.status !== "connected") {
      getActiveWASocket().catch(() => {});
    }
    return {
      linked: true,
      status: "connected",
      qrDataUrl: null,
      phone: state.phone || OWNER_WHATSAPP,
    };
  }

  if (state.qrDataUrl) {
    return {
      linked: false,
      status: state.status,
      qrDataUrl: state.qrDataUrl,
      phone: null,
    };
  }

  // If disconnected or not running, trigger socket creation
  if (!state.qrDataUrl && state.status !== "connected") {
    if (state.status === "disconnected" || !state.sock) {
      state.sock = null;
      console.log("⚡ Triggering getActiveWASocket from getWhatsAppStatus...");
      getActiveWASocket().catch((err) => {
        console.error("❌ getActiveWASocket failed inside getWhatsAppStatus:", err);
      });
    }
  }

  // Wait up to 10 seconds for the QR code to be generated by Baileys
  for (let i = 0; i < 30; i++) {
    if (state.qrDataUrl || (state.status as string) === "connected") {
      console.log(`🎯 QR resolved after ${i * 300}ms!`);
      break;
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  return {
    linked: state.status === "connected",
    status: state.status,
    qrDataUrl: state.qrDataUrl,
    phone: state.phone || null,
  };
}

/** Disconnect / logout WhatsApp and wipe local auth */
export async function disconnectWhatsApp(): Promise<void> {
  if (state.sock) {
    try {
      await state.sock.logout();
    } catch {
      try {
        state.sock.end(undefined);
      } catch {
        /* ignore */
      }
    }
  }
  state.sock = null;
  state.status = "disconnected";
  state.rawQR = null;
  state.qrDataUrl = null;
  state.phone = null;

  try {
    if (existsSync(AUTH_DIR)) {
      await rm(AUTH_DIR, { recursive: true, force: true });
    }
  } catch (err) {
    console.error("Failed to delete auth dir:", err);
  }
}

/** Send a WhatsApp message reliably */
export async function sendWhatsApp(
  to: string,
  text: string
): Promise<{ ok: boolean }> {
  const targetJid = normalizeJid(to);

  if (state.sock && state.status === "connected") {
    await state.sock.sendMessage(targetJid, { text });
    return { ok: true };
  }

  const sock = await getActiveWASocket();
  await waitForOpen(sock, 25_000);
  await sock.sendMessage(targetJid, { text });
  return { ok: true };
}

/** Helper used by scripts/wa-login.ts */
export async function startLoginFlow(
  onQR: (qr: string) => void
): Promise<void> {
  const sock = await getActiveWASocket();
  sock.ev.on("connection.update", (u) => {
    if (u.qr) onQR(u.qr);
  });
  await waitForOpen(sock, 120_000);
}
