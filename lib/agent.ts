import { catalogSummary, getProduct } from "./catalog";
import { getCampaign, saveCampaign, type StoreCampaign } from "./store";

/**
 * The salesperson brain — a friendly Pakistani e-commerce salesperson for
 * Dastiyab Store. Speaks Roman Urdu mixed with English, like the owner.
 */

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

export interface OrderItem {
  productId: string;
  productName: string;
  theme: string | null;
  price: number;
  qty: number;
}

export interface OrderDraft {
  customerName: string;
  phone: string;
  address: string;
  city: string;
  items: OrderItem[];
  total: number;
  paymentMethod: "COD";
}

const LLM_BASE_URL = (
  process.env.LLM_BASE_URL ||
  "https://generativelanguage.googleapis.com/v1beta/openai/"
).replace(/\/$/, "");
const LLM_API_KEY = process.env.LLM_API_KEY || "";
const LLM_MODEL = process.env.LLM_MODEL || "gemini-3.8-flash";

async function chatCompletion(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  opts: { json?: boolean; maxTokens?: number } = {}
): Promise<string> {
  if (!LLM_API_KEY) {
    throw new Error("LLM is not configured — set LLM_API_KEY.");
  }
  const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages,
      max_tokens: opts.maxTokens ?? 500,
      temperature: 0.7,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LLM request failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM returned an empty response.");
  return content;
}

export async function buildSystemPrompt(catalog: string): Promise<string> {
  const campaign = await getCampaign().catch(() => null);

  let prompt = `You are "Dastiyab Assistant", the friendly salesperson for Dastiyab Store (dastiyabstore.com), an online store in Karachi, Pakistan selling affordable gadgets, gift sets and personal care.

How you talk:
- Speak like a friendly Pakistani shopkeeper: Roman Urdu mixed with English (e.g. "Assalam-o-Alaikum! Kya haal hain? Aapko kis product ke baray mein janna hai?").
- Write in SHORT bursts — 1-2 short lines at a time, like a human typing on WhatsApp/Instagram. NEVER write long 5-10 line paragraphs. If you have more to say, break it into separate short thoughts (each on its own line).
- Warm, helpful, never pushy. Use the occasional emoji but don't overdo it.`;

  if (campaign && campaign.active && campaign.announcement) {
    prompt += `\n\n🔥 CURRENT ACTIVE STORE PROMO / CAMPAIGN (CRITICAL):
"${campaign.announcement}"
- You MUST actively tell customers about this offer whenever they ask about delivery, prices, deals, or are placing an order!
- If the owner set specific items with free delivery (e.g. from an active ad campaign), apply FREE delivery strictly to those items!`;
  }

  if (campaign?.customInstructions) {
    prompt += `\n\n📌 STORE OWNER SPECIAL INSTRUCTIONS (CRITICAL TO FOLLOW):
"${campaign.customInstructions}"
- Follow these instructions strictly in your chat behavior and sales pitch.`;
  }

  prompt += `\n\n💰 PRICING, WHOLESALE & VENDOR RULES:
- All prices listed in the catalog are already final, discounted, and fixed.
- If ANY customer, dukandar, dealer, or vendor asks for wholesale rates, bulk discounts, or special supplier pricing:
  Politely tell them in Roman Urdu:
  "Hamari prices already discounted / wholesale aur fixed hain. Jo rate catalog mein likha hai wahi final aur best price hai."
  Always quote the EXACT same catalog price to everyone — no separate vendor discounts.

Your catalog (these are the ONLY products you can sell — every line is a separate product):
${catalog}

CRITICAL product rules:
- Each catalog line is a SEPARATE product. A theme/color in brackets (e.g. Pink vs Purple) means a DIFFERENT product with a DIFFERENT id — never treat theme as a choosable option of one product.
- NEVER offer or confirm an out-of-stock product. If a customer asks for one, apologize briefly and suggest the closest in-stock alternative.
- Always confirm the EXACT product (name + theme) and price before finalizing any order.

How you take orders (Cash on Delivery only):
1. Help the customer pick the exact product (name + theme).
2. Collect: naam, mobile number, complete address, city.
3. Read back the order: product (with theme), price, and delivery details — and ask "Order confirm kar dun?"
4. Only when the customer says yes (han / yes / confirm / done), the order is CONFIRMED.
5. Delivery info: Standard is Karachi 2-3 days, rest of Pakistan 5-7 working days. Payment: Cash on Delivery. (Check active campaign above for any free delivery offers!).

Never invent products, prices, or delivery promises. If you don't know something, say you'll check with the store owner.`;

  return prompt;
}

/**
 * SMART NATURAL LANGUAGE INSTRUCTION PROCESSOR:
 * Understands ANY free-form instruction from the store owner (via WhatsApp or Dashboard)
 * such as:
 *  - "bhai aaj humne ads chalaye hain to m10 earbuds aur p9 pe delivery free hai"
 *  - "aaj se karachi delivery charges 150 hain baqi pakistan 250"
 *  - "eid sale chal rahi hai 2 items par 100 off do"
 *  - "offer band kardo abhi normal chalao"
 */
export async function processOwnerInstruction(
  rawText: string,
  source: "whatsapp" | "dashboard"
): Promise<{
  campaign: StoreCampaign;
  replyToOwner: string;
}> {
  const catalog = await catalogSummary();

  const INSTRUCTION_PROMPT = `You are the executive AI manager for Dastiyab Store (dastiyabstore.com, Karachi).
The store owner has sent you a new business instruction, ad campaign update, promo, or behavior change.
The owner talks in Roman Urdu / English.

Catalog of available products:
${catalog}

Owner's message:
"${rawText}"

Your job:
1. Understand the owner's instruction completely:
   - Is it turning off the campaign/offer? (isDeactivation = true)
   - Which specific products (if any) are part of this ad or promo?
   - What is the exact delivery rule or discount?
   - What should the AI tell customers in Instagram / Facebook DMs?
2. Synthesize:
   - "isDeactivation": boolean
   - "summary": A short 1-line Roman Urdu summary (e.g. "M10 aur P9 par delivery free (Ad promo)")
   - "announcement": The exact pitch/offer to tell customers in DMs (e.g. "Special Ad Offer: Aaj M10 Wireless Earbuds aur P9 Headphones par delivery bilkul FREE hai!")
   - "instructions": Exact rules for the AI assistant (e.g. "Customer M10 ya P9 select kare to delivery 0 lagao. Baqi products par standard delivery charge karo.")
   - "replyToOwner": A natural, respectful, confident Roman Urdu acknowledgement to the store owner (e.g. "Jee bhai, bilkul samajh gaya! M10 aur P9 par delivery free kar di hai aur DMs mein customers ko yahi offer promote karunga.").

Return STRICT JSON only in this shape:
{
  "isDeactivation": boolean,
  "summary": string,
  "announcement": string,
  "instructions": string,
  "replyToOwner": string
}`;

  let parsed: {
    isDeactivation?: boolean;
    summary?: string;
    announcement?: string;
    instructions?: string;
    replyToOwner?: string;
  };

  try {
    const raw = await chatCompletion(
      [{ role: "system", content: INSTRUCTION_PROMPT }],
      { json: true, maxTokens: 450 }
    );
    parsed = JSON.parse(raw);
  } catch (err) {
    // Fallback if LLM request fails
    parsed = {
      isDeactivation: false,
      summary: rawText.slice(0, 50),
      announcement: rawText,
      instructions: rawText,
      replyToOwner: `Jee bhai, aapka message note kar liya gaya hai: "${rawText}". AI isi mutabiq reply karega.`,
    };
  }

  if (parsed.isDeactivation) {
    const updated = await saveCampaign(
      {
        active: false,
        summary: "Campaign Deactivated",
        rawMessage: rawText,
      },
      source
    );
    return {
      campaign: updated,
      replyToOwner:
        parsed.replyToOwner ||
        "Jee bhai, offer band kar di gayi hai. Ab AI standard catalog rates aur regular delivery charges par baat karega.",
    };
  }

  const updated = await saveCampaign(
    {
      active: true,
      announcement: parsed.announcement || rawText,
      customInstructions: parsed.instructions || rawText,
      summary: parsed.summary || rawText.slice(0, 50),
      rawMessage: rawText,
    },
    source
  );

  return {
    campaign: updated,
    replyToOwner:
      parsed.replyToOwner ||
      `Jee bhai, samajh gaya! Nayi campaign activate kar di hai: "${parsed.announcement || rawText}".`,
  };
}

/**
 * Generate the next salesperson reply for an ongoing DM conversation.
 */
export async function chatReply(
  history: ChatMessage[],
  message: string
): Promise<string> {
  const catalog = await catalogSummary();
  const systemPrompt = await buildSystemPrompt(catalog);
  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemPrompt },
  ];
  for (const m of history.slice(-20)) {
    messages.push({
      role: m.role === "user" ? "user" : "assistant",
      content: m.text,
    });
  }
  messages.push({ role: "user", content: message });
  return (await chatCompletion(messages)).trim();
}

/**
 * HUMAN-LIKE MESSAGING: split a generated reply into short chat bubbles.
 */
export function splitIntoBubbles(reply: string): string[] {
  const cleaned = reply.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (!cleaned) return [];

  const bubbles: string[] = [];
  const thoughts = cleaned
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const thought of thoughts) {
    const sentences =
      thought.match(/[^.!?…\n]+[.!?…]+["”']?|\S[^.!?…\n]*$/g) ?? [thought];
    let current = "";
    for (let s of sentences) {
      s = s.trim();
      if (!s) continue;
      const candidate = current ? `${current} ${s}` : s;
      if (candidate.length > 160 && current) {
        bubbles.push(current);
        current = s;
      } else {
        current = candidate;
      }
    }
    if (current) bubbles.push(current);
  }

  if (bubbles.length > 1 && bubbles[bubbles.length - 1].length < 25) {
    const last = bubbles.pop() as string;
    bubbles[bubbles.length - 1] = `${bubbles[bubbles.length - 1]} ${last}`;
  }

  return bubbles.slice(0, 4);
}

/** Convenience: generate the reply already split into sendable bubbles. */
export async function chatReplyBubbles(
  history: ChatMessage[],
  message: string
): Promise<string[]> {
  const reply = await chatReply(history, message);
  const bubbles = splitIntoBubbles(reply);
  return bubbles.length > 0 ? bubbles : [reply];
}

// ---------------------------------------------------------------- order extraction

const EXTRACT_PROMPT = `You extract confirmed COD orders from a Dastiyab Store DM conversation.
Return STRICT JSON only, no other text, in this shape:
{
  "confirmed": boolean,           // true ONLY if the customer explicitly confirmed the order (han/yes/confirm/done AFTER the details were read back)
  "customerName": string | null,
  "phone": string | null,
  "address": string | null,
  "city": string | null,
  "items": [{ "productId": string, "qty": number }],
  "notes": string | null
}
Rules:
- confirmed=false if the customer only asked about products, gave partial details, or never said yes to the final confirmation.
- productId must be one of the catalog ids shown below; pick the id whose name+theme matches what the customer chose.
- If anything is missing, set it to null — do not guess phone numbers or addresses.`;

export async function extractOrder(
  history: ChatMessage[]
): Promise<OrderDraft | null> {
  if (history.length < 4) return null;
  const catalog = await catalogSummary();
  const transcript = history
    .map((m) => `${m.role === "user" ? "Customer" : "Assistant"}: ${m.text}`)
    .join("\n");

  const raw = await chatCompletion(
    [
      { role: "system", content: `${EXTRACT_PROMPT}\n\nCatalog:\n${catalog}` },
      { role: "user", content: `Conversation:\n${transcript}` },
    ],
    { json: true, maxTokens: 500 }
  );

  let parsed: {
    confirmed?: boolean;
    customerName?: string | null;
    phone?: string | null;
    address?: string | null;
    city?: string | null;
    items?: { productId?: string; qty?: number }[];
  };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed.confirmed || !parsed.items || parsed.items.length === 0) return null;

  const items: OrderItem[] = [];
  for (const it of parsed.items) {
    if (!it.productId) continue;
    const product = await getProduct(it.productId);
    if (!product || !product.inStock) continue;
    const qty = it.qty && it.qty > 0 ? Math.floor(it.qty) : 1;
    items.push({
      productId: product.id,
      productName: product.name,
      theme: product.theme,
      price: product.price,
      qty,
    });
  }
  if (items.length === 0) return null;

  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  return {
    customerName: parsed.customerName?.trim() || "—",
    phone: parsed.phone?.trim() || "—",
    address: parsed.address?.trim() || "—",
    city: parsed.city?.trim() || "—",
    items,
    total,
    paymentMethod: "COD",
  };
}

/** WhatsApp-friendly order text sent to the owner via Baileys. */
export function formatOrderWhatsApp(
  order: OrderDraft,
  platform: "instagram" | "facebook"
): string {
  const lines = [
    `🧾 *New Order — Dastiyab Store* (${platform})`,
    ``,
    ...order.items.map(
      (i, n) =>
        `${n + 1}. ${i.productName}${i.theme ? ` (${i.theme})` : ""} x${i.qty} — Rs.${i.price * i.qty}`
    ),
    ``,
    `*Total: Rs.${order.total}* (COD)`,
    ``,
    `👤 ${order.customerName}`,
    `📞 ${order.phone}`,
    `📍 ${order.address}, ${order.city}`,
  ];
  return lines.join("\n");
}
