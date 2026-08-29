import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/auth-helpers";
import { generateRequestId, createError, formatErrorResponse } from "@/lib/errors";

export async function GET(request: NextRequest) {
  const requestId = generateRequestId();

  try {
    const user = await getUser();

    if (!user) {
      return NextResponse.json(
        formatErrorResponse(createError("AUTH_REQUIRED", "Authentication required"), requestId),
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const portfolioId = searchParams.get("portfolioId");
    const admin = createAdminClient();

    // Get portfolio
    let query = admin
      .from("medical_events")
      .select(`
        id,
        event_date,
        event_type,
        title,
        description,
        source_extraction_ids,
        verification_status,
        created_at
      `)
      .eq("user_id", user.id)
      .order("event_date", { ascending: true });

    if (portfolioId) {
      query = query.eq("portfolio_id", portfolioId);
    }

    const { data: events, error: eventsError } = await query;

    if (eventsError) {
      return NextResponse.json(
        formatErrorResponse(createError("INTERNAL_ERROR", "Could not load timeline"), requestId),
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: {
        events: events || [],
        totalEvents: events?.length || 0,
      },
      error: null,
      requestId,
    });
  } catch {
    return NextResponse.json(
      formatErrorResponse(createError("INTERNAL_ERROR", "Something went wrong"), requestId),
      { status: 500 }
    );
  }
}
