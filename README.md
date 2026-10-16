# Dastiyab Store — DM Sales Agent

Instagram/Facebook DM sales agent for **Dastiyab Store** (dastiyabstore.com, Karachi).
It chats with customers in Roman Urdu + English, sells from the live product catalog,
confirms COD orders, and WhatsApps the order details to the owner.

**How it runs on Vercel (serverless):** there is no always-on process. Instead two
Vercel Crons do the work:

| Cron | Schedule | What it does |
|---|---|---|
| `/api/cron/check-dms` | every 2 min | Pull new IG/FB DMs → agent replies (human-like bubbles) → confirmed orders → WhatsApp to owner via Baileys |
| `/api/cron/sync-catalog` | daily 03:00 PKT | Re-scrape dastiyabstore.com → detect new/removed/price/stock changes → update catalog → WhatsApp summary to owner |

Plus a tiny dark-themed dashboard at `/` (orders, stock alerts, DM activity) and
`/api/health` for status.

---

## 1. Model choice — why no fine-tuning / "training"

We use **Gemini** (via its OpenAI-compatible endpoint) with a strong system prompt
plus the live product catalog injected into every reply. **No fine-tuning, no
"complete training"** — deliberately:

- The task is narrow: 47 known products, fixed COD sales flow. A good prompt +
  catalog grounding already answers reliably.
- Fine-tuning costs time and money and would need hundreds of labeled
  conversations we don't have — it buys nothing for this use-case.
- Swapping models later is one env var (`LLM_MODEL`); nothing is baked in.

Any OpenAI-compatible API works — point `LLM_BASE_URL` at it.

## 2. Human-like messaging

A real shopkeeper doesn't send 8-line paragraphs. The agent:

1. Generates a reply, then `splitIntoBubbles()` (in `lib/agent.ts`) breaks it
   into **2–3 short bubbles** (max ~2 short lines / 160 chars each, split on
   sentence boundaries, never mid-word, max 4 bubbles).
2. The cron route sends bubbles **one by one with a 1.2–2.5s "typing" pause**
   between them — like a person typing on IG/WhatsApp.

The model is also prompted to write in short bursts, so the splitter mostly
just respects its line breaks.

## 3. Environment variables

Copy `.env.example` → `.env.local` (local) and set the same in Vercel
(Project → Settings → Environment Variables):

| Var | What |
|---|---|
| `LLM_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta/openai/` (or any OpenAI-compatible base) |
| `LLM_API_KEY` | Google AI Studio key (free at aistudio.google.com) |
| `LLM_MODEL` | `gemini-2.0-flash` |
| `WA_CREDS_JSON` | Baileys session (base64, printed by `npm run wa:login`) — Vercel production only |
| `OWNER_WHATSAPP` | Owner's WhatsApp number, e.g. `923162975195` |
| `IG_COOKIES` / `FB_COOKIES` | Session cookies (see §5) — easiest login method |
| `CRON_SECRET` | Long random string; Vercel sends it automatically on cron hits |
| `DATA_DIR` | Writable dir for conversations/orders/synced catalog (default `/tmp/dastiyab-agent`) |

## 4. GitHub → Vercel deploy

```bash
cd ~/workspace/dastiyab-store/agent
git init
git add .
git commit -m "Dastiyab DM agent v0.1"
gh repo create dastiyab-dm-agent --private --source=. --push
# or: create the repo on github.com and
# git remote add origin git@github.com:<you>/dastiyab-dm-agent.git
# git push -u origin main
```

Vercel:
1. **Add New → Project → Import** the repo.
2. Framework preset: Next.js (auto-detected).
3. Add all **Environment Variables** from §3 (Production + Preview).
4. Deploy. `vercel.json` registers both crons automatically —
   check **Project → Cron Jobs** to confirm they're active.

> ⚠️ **Vercel plan limits:** Hobby-plan crons have restricted frequency —
> a `*/2 * * * *` schedule may be throttled to a slower cadence on Hobby.
> If replies feel delayed, that's the cause. Options: upgrade to Pro, or
> move the DM listener to a small VPS (see §8) and keep Vercel for the
> dashboard/API.

## 5. Instagram / Facebook login (NO Meta App ID — by design)

The owner chose the session-cookie route instead of a Meta App ID, so
`lib/meta.ts` drives the same web endpoints instagram.com uses, authenticated
with the owner's login cookies. **This is unofficial and fragile** — Meta
changes these endpoints, and aggressive polling risks rate limits. The cron's
2-minute cadence is deliberately gentle.

**Setup (recommended — cookie paste):**
1. Log in to Instagram in a normal desktop browser (as the store account).
2. Open DevTools → Application → Cookies → `instagram.com`, copy the full
   `Cookie` header value (e.g. via DevTools Network tab, any request).
3. Paste it into `IG_COOKIES` (Vercel env). Same for `FB_COOKIES` if/when the
   Facebook flow is wired (currently a documented stub — see below).
4. Redeploy (or wait for env propagation).

`MetaSessionClient.loginWithPassword()` exists as a best-effort helper but
**2FA / login challenges can't be solved in code** — use cookie-paste then.

**Facebook status:** `getNewMessages()`/`sendMessage()` for Facebook are
documented stubs in `lib/meta.ts` — personal-account FB messaging has no
stable private endpoint. The cron skips Facebook gracefully until either the
official API is adopted or a working session flow is captured.

## 6. WhatsApp setup (Baileys — NO api key)

> Correction: "Bellys" was a mishearing — it's **Baileys**
> (`@whiskeysockets/baileys`), the open-source WhatsApp Web library.
> There is **no API key and no HTTP API**. You scan a QR once with the
> owner's WhatsApp, the session persists, and the agent sends through it.

**Option A — terminal (recommended):**
1. `npm run wa:login`
2. Scan the printed QR with WhatsApp (⋮ menu → **Linked devices → Link a
   device**).
3. Session is saved to `data/baileys-auth/` (gitignored — never commit it).

**Option B — dashboard:** the dashboard has a WhatsApp card that shows the
link status and renders a QR when not linked (works best in local dev).

**For Vercel production:** `/tmp` is ephemeral, so session files won't
survive between cron runs. After pairing locally, `npm run wa:login`
prints a `WA_CREDS_JSON` base64 string — paste it into Vercel env vars.
The app restores the session from it automatically on every run.

Each cron run does **connect → send → close** with the saved creds
(serverless-friendly). On a future VPS worker the socket can stay
persistent instead — see `getWhatsAppSocket()` in `lib/whatsapp.ts` and §9.

## 7. Daily catalog sync

`sync-catalog` re-fetches `dastiyabstore.com/shop` every morning, diffs it
against the known catalog and:

- **New products** → added, flagged `needsReview: true` (verify details on
  the dashboard's stock-alerts card).
- **Removed from site** → marked out-of-stock (never deleted, keeps history).
- **Price changes / stock flips** → updated in place.
- Sends the owner a WhatsApp summary of every change (or "koi change nahi").

Key catalog fact the agent relies on: Dastiyab's own products have **no
variant selectors** — a theme/color difference is a separate listing
(e.g. 3-in-1 Pink vs Purple are distinct product ids). The system prompt
and order extraction both enforce this.

## 8. Swapping to the official Meta API later

`lib/meta.ts` is the only module that knows about session hacks. Everything
else (cron route, agent, WhatsApp, dashboard) depends only on the
`DMMessage` interface + `getNewMessages()`/`sendMessage()`. To go official:

1. Create a Meta App, connect the IG Business account + FB Page, pass app review.
2. Rewrite `MetaSessionClient` to call the Graph API / Instagram Messaging API
   webhooks instead (same method signatures).
3. Nothing else changes.

## 9. VPS migration note (when 24/7 real-time matters)

Vercel Cron polling = simple, free, but replies lag up to ~2 minutes and each
run cold-starts. When order volume justifies it:

- Move **only the DM listener** to a cheap VPS (~$4–6/mo, Hetzner/Contabo):
  a small Node process holding the login session, polling every ~15s,
  calling the same `lib/` logic (extract `lib/` into a shared package or
  call the Vercel API routes from the VPS).
- Keep the **dashboard + API + crons** on Vercel untouched.

Do **not** use Hostinger shared hosting for the listener — long-running Node
processes get killed there; it's for websites, not bots.

## 10. Local dev

```bash
npm install
cp .env.example .env.local   # fill in keys
npm run dev                  # http://localhost:3000
npm run typecheck            # tsc --noEmit
```

Trigger crons manually (with `CRON_SECRET` set):

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/check-dms
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync-catalog
```

## Project layout

```
app/
  page.tsx                    dark branded dashboard (orders, stock alerts, DM activity)
  api/health/route.ts         liveness + catalog stats
  api/cron/check-dms/route.ts DM check → bubble replies → order → WhatsApp
  api/wa/qr/route.ts        WhatsApp pairing QR for the dashboard card
  api/cron/sync-catalog/route.ts daily shop re-scrape + diff + WhatsApp summary
lib/
  agent.ts    salesperson brain (Gemini), bubble splitter, order extraction
  catalog.ts  catalog loading/search (synced copy preferred, bundled fallback)
  whatsapp.ts Baileys WhatsApp (QR pairing, no API key) + scripts/wa-login.ts
  meta.ts     session-based IG/FB client (FRAGILE — see header comment)
  store.ts    JSON-file persistence (ephemeral on Vercel — migrate to KV later)
data/
  catalog.json  bundled snapshot of the 47 products (2026-10-06)
vercel.json     cron schedules
```
