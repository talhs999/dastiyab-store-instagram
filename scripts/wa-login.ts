#!/usr/bin/env tsx
/**
 * One-time WhatsApp pairing for the Dastiyab DM agent (Baileys).
 *
 *   npm run wa:login
 *
 * Prints a QR in the terminal → scan it with WhatsApp on the owner's phone
 * (⋮ menu → Linked devices → Link a device) → session creds are saved to
 * data/baileys-auth/ (gitignored).
 *
 * For Vercel production: the script prints a WA_CREDS_JSON base64 string at
 * the end — paste it into Vercel env vars, because /tmp is ephemeral there.
 */
import qrcode from "qrcode-terminal";
import {
  exportCredsForEnv,
  isWhatsAppLinked,
  startLoginFlow,
} from "../lib/whatsapp";

async function main(): Promise<void> {
  if (await isWhatsAppLinked()) {
    console.log("✅ WhatsApp is already linked. Nothing to do.");
    process.exit(0);
  }

  console.log(
    "📱 Scan this QR with WhatsApp (⋮ menu → Linked devices → Link a device):\n"
  );

  await startLoginFlow((qr) => qrcode.generate(qr, { small: true }));

  console.log("\n✅ Paired! Session saved to data/baileys-auth/.");
  console.log(
    "\nFor Vercel production, add this env var (WA_CREDS_JSON) — /tmp is ephemeral on Vercel:\n"
  );
  console.log(await exportCredsForEnv());
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error("❌ Pairing failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
