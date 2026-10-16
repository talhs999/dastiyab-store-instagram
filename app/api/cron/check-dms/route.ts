import { NextRequest, NextResponse } from "next/server";
import { MetaSessionClient, type Platform } from "@/lib/meta";
import {
  chatReplyBubbles,
  extractOrder,
  formatOrderWhatsApp,
  type ChatMessage,
} from "@/lib/agent";
import { sendWhatsApp } from "@/lib/whatsapp";
import {
  getConversation,
  saveConversation,
  appendOrder,
  getMeta,
  setMeta,
  markProcessed,
  type Conversation,
} from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const OWNER_WHATSAPP = process.env.OWNER_WHATSAPP || "923162975195";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn("CRON_SECRET is not set — cron route is unprotected!");
    return true;
  }
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * Runs every 2 minutes:
 *  1. Pull new IG/FB DMs via session client.
 *  2. Reply with the human-like salesperson agent.
 *  3. Detect confirmed COD orders → WhatsApp the owner via Baileys.
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const meta = await getMeta();
  const seen = new Set(meta.processedIds ?? []);
  const newlyProcessed: string[] = [];
  const results: unknown[] = [];

  for (const platform of ["instagram", "facebook"] as Platform[]) {
    const client = await MetaSessionClient.load(platform);
    if (!client) {
      results.push({
        platform,
        status: "skipped",
        reason: "no session — set IG_COOKIES / FB_COOKIES",
      });
      continue;
    }

    const messages = await client.getNewMessages();
    const fresh = messages.filter((m) => !seen.has(m.id));
    let replied = 0;
    let orders = 0;

    for (const msg of fresh) {
      try {
        const existing = await getConversation(msg.threadId);
        const convo: Conversation = existing ?? {
          threadId: msg.threadId,
          platform,
          handle: msg.sender,
          messages: [],
          orderNotified: false,
          updatedAt: new Date().toISOString(),
        };

        const now = new Date().toISOString();

        const history: ChatMessage[] = convo.messages.map((m) => ({
          role: m.role,
          text: m.text,
        }));

        // Generate and send human-like chat bubbles
        const bubbles = await chatReplyBubbles(history, msg.text);
        for (let i = 0; i < bubbles.length; i++) {
          await client.sendMessage(msg.threadId, bubbles[i]);
          if (i < bubbles.length - 1) {
            await sleep(1200 + Math.random() * 1300); // 1.2–2.5s pause
          }
        }
        const reply = bubbles.join("\n");

        const fullHistory: ChatMessage[] = [
          ...history,
          { role: "user", text: msg.text },
        ];
        convo.messages.push({ role: "user", text: msg.text, at: msg.timestamp });
        convo.messages.push({ role: "assistant", text: reply, at: now });
        convo.updatedAt = now;
        convo.handle = msg.sender;

        // Order detection: only once per conversation, only when confirmed
        if (!convo.orderNotified) {
          const order = await extractOrder(fullHistory);
          if (order) {
            if (OWNER_WHATSAPP) {
              await sendWhatsApp(
                OWNER_WHATSAPP,
                formatOrderWhatsApp(order, platform)
              );
              await appendOrder({
                ...order,
                threadId: msg.threadId,
                platform,
                at: now,
              });
              convo.orderNotified = true;
              orders++;
            }
          }
        }

        await saveConversation(convo);
        replied++;
      } catch (err) {
        console.error(`[${platform}] failed on message ${msg.id}:`, err);
        results.push({
          platform,
          messageId: msg.id,
          status: "error",
          error: String(err).slice(0, 200),
        });
      } finally {
        newlyProcessed.push(msg.id);
        seen.add(msg.id);
      }
    }

    results.push({
      platform,
      status: "ok",
      newMessages: fresh.length,
      replied,
      orders,
    });
  }

  await markProcessed(newlyProcessed);
  await setMeta({ lastCheck: new Date().toISOString() });
  return NextResponse.json({ ok: true, results });
}
