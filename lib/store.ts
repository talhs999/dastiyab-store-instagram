import { promises as fs } from "fs";
import path from "path";
import type { OrderDraft } from "./agent";

/**
 * Tiny JSON-file persistence layer.
 * Persists locally in data/ (or custom DATA_DIR, like /tmp on Vercel).
 */
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, file), "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}

// ---------------------------------------------------------------- conversations

export interface StoredMessage {
  role: "user" | "assistant";
  text: string;
  at: string; // ISO timestamp
}

export interface Conversation {
  threadId: string;
  platform: "instagram" | "facebook";
  handle: string; // sender username where known
  messages: StoredMessage[];
  orderNotified: boolean; // true once the confirmed order was sent to owner
  updatedAt: string;
}

type ConversationMap = Record<string, Conversation>;

export async function getConversation(
  threadId: string
): Promise<Conversation | null> {
  const all = await readJson<ConversationMap>("conversations.json", {});
  return all[threadId] ?? null;
}

export async function saveConversation(convo: Conversation): Promise<void> {
  const all = await readJson<ConversationMap>("conversations.json", {});
  all[convo.threadId] = convo;
  await writeJson("conversations.json", all);
}

/** Most recently active conversations, newest first (for the dashboard). */
export async function listConversations(limit = 10): Promise<Conversation[]> {
  const all = await readJson<ConversationMap>("conversations.json", {});
  return Object.values(all)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}

// ---------------------------------------------------------------- orders

export interface OrderRecord extends OrderDraft {
  threadId: string;
  platform: "instagram" | "facebook";
  at: string; // ISO timestamp
}

export async function appendOrder(order: OrderRecord): Promise<void> {
  const orders = await readJson<OrderRecord[]>("orders.json", []);
  orders.unshift(order);
  await writeJson("orders.json", orders.slice(0, 200)); // keep last 200
}

export async function getOrders(limit = 20): Promise<OrderRecord[]> {
  const orders = await readJson<OrderRecord[]>("orders.json", []);
  return orders.slice(0, limit);
}

// ---------------------------------------------------------------- store campaign & AI instructions

export interface StoreCampaign {
  active: boolean;
  announcement: string; // e.g. "Abhi special offer hai: M10 aur P9 par delivery bilkul FREE hai!"
  customInstructions: string;
  summary?: string;
  rawMessage?: string;
  updatedAt: string;
  updatedVia: "dashboard" | "whatsapp";
}

const DEFAULT_CAMPAIGN: StoreCampaign = {
  active: true,
  announcement: "Special Promo: Karachi mein delivery bilkul FREE hai! Baqi Pakistan Cash on Delivery (COD) standard charges.",
  customInstructions: "Agar customer delivery charges pooche to bolo Karachi mein bilkul FREE delivery hai.",
  summary: "Karachi free delivery promo",
  rawMessage: "Karachi mein delivery free hai",
  updatedAt: new Date().toISOString(),
  updatedVia: "dashboard",
};

export async function getCampaign(): Promise<StoreCampaign> {
  return readJson<StoreCampaign>("campaign.json", DEFAULT_CAMPAIGN);
}

export async function saveCampaign(
  patch: Partial<StoreCampaign>,
  via: "dashboard" | "whatsapp" = "dashboard"
): Promise<StoreCampaign> {
  const current = await getCampaign();
  const updated: StoreCampaign = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
    updatedVia: via,
  };
  await writeJson("campaign.json", updated);
  return updated;
}

// ---------------------------------------------------------------- meta state

export interface MetaState {
  lastCheck?: string; // ISO timestamp of last DM check
  lastSync?: string; // ISO timestamp of last catalog sync
  lastPriceCheckCount?: number;
  processedIds?: string[]; // DM message ids already handled
}

export async function getMeta(): Promise<MetaState> {
  return readJson<MetaState>("meta.json", {});
}

export async function setMeta(patch: Partial<MetaState>): Promise<void> {
  const current = await getMeta();
  await writeJson("meta.json", { ...current, ...patch });
}

export async function markProcessed(ids: string[]): Promise<void> {
  const meta = await getMeta();
  const seen = new Set([...(meta.processedIds ?? []), ...ids]);
  await setMeta({ processedIds: [...seen].slice(-500) });
}

// ---------------------------------------------------------------- meta sessions

export async function getSessionCookies(
  platform: "instagram" | "facebook"
): Promise<string | null> {
  const fromEnv =
    platform === "instagram" ? process.env.IG_COOKIES : process.env.FB_COOKIES;
  if (fromEnv) return fromEnv;
  const sessions = await readJson<Record<string, string>>("sessions.json", {});
  return sessions[platform] ?? null;
}

export async function setSessionCookies(
  platform: "instagram" | "facebook",
  cookies: string
): Promise<void> {
  const sessions = await readJson<Record<string, string>>("sessions.json", {});
  sessions[platform] = cookies;
  await writeJson("sessions.json", sessions);
}
