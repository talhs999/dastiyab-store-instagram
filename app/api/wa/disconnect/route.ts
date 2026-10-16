import { NextResponse } from "next/server";
import { disconnectWhatsApp } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

/**
 * POST /api/wa/disconnect
 * Logs out and resets local WhatsApp auth
 */
export async function POST() {
  try {
    await disconnectWhatsApp();
    return NextResponse.json({ ok: true, disconnected: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}
