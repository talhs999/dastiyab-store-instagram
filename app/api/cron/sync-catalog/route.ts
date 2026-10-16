import { NextRequest, NextResponse } from "next/server";
import { performCatalogSync } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn("CRON_SECRET is not set — cron route is unprotected!");
    return true;
  }
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * Runs daily (e.g. 03:00 PKT via vercel.json):
 *  - Checks every product on dastiyabstore.com/shop
 *  - Verifies prices and stock status
 *  - Updates local catalog
 *  - WhatsApps the owner with a detailed summary!
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await performCatalogSync(true);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }

  return NextResponse.json(result);
}
