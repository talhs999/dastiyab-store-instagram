import { NextResponse } from "next/server";
import { loadCatalog } from "@/lib/catalog";
import { getMeta } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Simple liveness + catalog status check. */
export async function GET() {
  const catalog = await loadCatalog();
  const meta = await getMeta();
  return NextResponse.json({
    ok: true,
    products: catalog.length,
    inStock: catalog.filter((p) => p.inStock).length,
    lastCheck: meta.lastCheck ?? null,
    lastSync: meta.lastSync ?? null,
    version: "0.1.0",
  });
}
