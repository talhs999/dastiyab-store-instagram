import { NextResponse } from "next/server";
import { getWhatsAppStatus } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

/**
 * GET /api/wa/status
 * Returns live WhatsApp pairing/connection status
 */
export async function GET() {
  try {
    const status = await getWhatsAppStatus();
    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json(
      { linked: false, status: "disconnected", error: String(err) },
      { status: 500 }
    );
  }
}
