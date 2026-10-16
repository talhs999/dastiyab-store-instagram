import { NextRequest, NextResponse } from "next/server";
import {
  listConversations,
  getConversation,
  saveConversation,
  appendOrder,
  type Conversation,
} from "@/lib/store";
import {
  chatReplyBubbles,
  extractOrder,
  formatOrderWhatsApp,
  type ChatMessage,
} from "@/lib/agent";
import { sendWhatsApp } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

const OWNER_WHATSAPP = process.env.OWNER_WHATSAPP || "923162975195";

/**
 * GET /api/conversations
 * Returns all recorded DM conversations with full chat history
 */
export async function GET() {
  try {
    const convos = await listConversations(50);
    return NextResponse.json({ ok: true, conversations: convos });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/conversations
 * 1. action: "simulate" — simulates customer incoming message & gets AI salesperson reply
 * 2. action: "reply" — owner sends a manual reply into the thread
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, threadId, handle, text } = body as {
      action?: "simulate" | "reply";
      threadId?: string;
      handle?: string;
      text?: string;
    };

    if (!text || !text.trim()) {
      return NextResponse.json({ ok: false, error: "Text is required" }, { status: 400 });
    }

    const cleanText = text.trim();
    const cleanHandle = (handle || "customer").replace(/^@/, "").trim();
    const targetThreadId = threadId || `ig:thread_${cleanHandle.toLowerCase()}`;

    let convo = await getConversation(targetThreadId);
    if (!convo) {
      convo = {
        threadId: targetThreadId,
        platform: "instagram",
        handle: cleanHandle,
        messages: [],
        orderNotified: false,
        updatedAt: new Date().toISOString(),
      };
    }

    const now = new Date().toISOString();

    if (action === "reply") {
      // Owner sending manual reply
      convo.messages.push({
        role: "assistant",
        text: cleanText,
        at: now,
      });
      convo.updatedAt = now;
      await saveConversation(convo);
      return NextResponse.json({ ok: true, conversation: convo });
    }

    // Default action: "simulate" customer message -> AI replies
    convo.messages.push({
      role: "user",
      text: cleanText,
      at: now,
    });

    const history: ChatMessage[] = convo.messages.slice(0, -1).map((m) => ({
      role: m.role,
      text: m.text,
    }));

    // AI Salesperson generates response
    const bubbles = await chatReplyBubbles(history, cleanText);
    const aiReply = bubbles.join("\n\n");

    const replyAt = new Date().toISOString();
    convo.messages.push({
      role: "assistant",
      text: aiReply,
      at: replyAt,
    });
    convo.updatedAt = replyAt;

    // Detect confirmed COD orders
    if (!convo.orderNotified) {
      const fullHistory: ChatMessage[] = convo.messages.map((m) => ({
        role: m.role,
        text: m.text,
      }));
      const order = await extractOrder(fullHistory);
      if (order) {
        if (OWNER_WHATSAPP) {
          sendWhatsApp(OWNER_WHATSAPP, formatOrderWhatsApp(order, "instagram")).catch(() => {});
        }
        await appendOrder({
          ...order,
          threadId: targetThreadId,
          platform: "instagram",
          at: replyAt,
        });
        convo.orderNotified = true;
      }
    }

    await saveConversation(convo);
    return NextResponse.json({ ok: true, conversation: convo });
  } catch (err) {
    console.error("POST /api/conversations failed:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
