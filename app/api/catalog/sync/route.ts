import { NextResponse } from "next/server";
import { performCatalogSync } from "@/lib/sync";

export const dynamic = "force-dynamic";

/**
 * POST /api/catalog/sync
 * Triggered by the dashboard "Sync Catalog & Check Prices Now" button!
 */
export async function POST() {
  try {
    const result = await performCatalogSync(true);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}
