import { NextRequest, NextResponse } from "next/server";
import { getCampaign, saveCampaign } from "@/lib/store";
import { processOwnerInstruction } from "@/lib/agent";

export const dynamic = "force-dynamic";

/**
 * GET /api/campaign
 * Returns the current active store campaign & AI instructions
 */
export async function GET() {
  const campaign = await getCampaign();
  return NextResponse.json(campaign);
}

/**
 * POST /api/campaign
 * Updates store campaign & AI instructions from the dashboard using Smart AI understanding
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      message?: string;
      active?: boolean;
      announcement?: string;
      customInstructions?: string;
    };

    // If owner provided a natural language message, let Gemini comprehend it
    if (body.message && body.message.trim()) {
      const result = await processOwnerInstruction(body.message.trim(), "dashboard");
      return NextResponse.json({
        ok: true,
        campaign: result.campaign,
        reply: result.replyToOwner,
      });
    }

    // Direct toggle / fields update
    const updated = await saveCampaign(
      {
        active: body.active !== undefined ? body.active : true,
        announcement: body.announcement,
        customInstructions: body.customInstructions,
      },
      "dashboard"
    );

    return NextResponse.json({ ok: true, campaign: updated });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}
