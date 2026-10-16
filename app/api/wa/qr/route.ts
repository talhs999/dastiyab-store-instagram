import { NextResponse } from "next/server";
import { getWhatsAppStatus } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

/**
 * GET /api/wa/qr
 * Legacy / convenience endpoint polling status & QR
 */
export async function GET() {
  const status = await getWhatsAppStatus();
  if (status.linked) {
    return NextResponse.json({ linked: true });
  }
  return NextResponse.json({
    linked: false,
    qr: status.qrDataUrl,
    status: status.status,
  });
}
