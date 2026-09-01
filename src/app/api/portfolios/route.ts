import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth-helpers";
import { generateRequestId, createError, formatErrorResponse } from "@/lib/errors";

/**
 * POST /api/portfolios
 *
 * Idempotent portfolio creation for the authenticated user.
 * If a portfolio already exists, returns it.
 * If none exists, creates one and returns it.
 * Uses the authenticated server client with RLS — no service-role key.
 */
export async function POST(request: NextRequest) {
  const requestId = generateRequestId();

  try {
    const user = await getUser();

    if (!user) {
      return NextResponse.json(
        formatErrorResponse(
          createError("SESSION_REQUIRED", "Authentication required"),
          requestId
        ),
        { status: 401 }
      );
    }

    const supabase = createClient();

    // Check for existing portfolio first
    const { data: existing, error: fetchError } = await supabase
      .from("portfolios")
      .select("id, label, created_at")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      console.error("Portfolio fetch error:", fetchError.code);
      return NextResponse.json(
        formatErrorResponse(
          createError("NETWORK_ERROR", "Could not check your Healthfolio."),
          requestId
        ),
        { status: 500 }
      );
    }

    if (existing) {
      return NextResponse.json({
        data: {
          portfolio: existing,
          created: false,
        },
        error: null,
        requestId,
      });
    }

    // Create new portfolio
    const { data: newPortfolio, error: createError_ } = await supabase
      .from("portfolios")
      .insert({ user_id: user.id, label: "My Healthfolio" })
      .select("id, label, created_at")
      .single();

    if (createError_) {
      // Unique constraint violation — race condition: another request created it
      if (createError_.code === "23505") {
        const { data: racePortfolio } = await supabase
          .from("portfolios")
          .select("id, label, created_at")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();

        if (racePortfolio) {
          return NextResponse.json({
            data: {
              portfolio: racePortfolio,
              created: false,
            },
            error: null,
            requestId,
          });
        }
      }

      console.error("Portfolio create error:", createError_.code, createError_.message);
      return NextResponse.json(
        formatErrorResponse(
          createError("PORTFOLIO_CREATE_FAILED", "Could not create your Healthfolio. Please try again."),
          requestId
        ),
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: {
        portfolio: newPortfolio,
        created: true,
      },
      error: null,
      requestId,
    });
  } catch {
    return NextResponse.json(
      formatErrorResponse(
        createError("INTERNAL_ERROR", "Something went wrong"),
        requestId
      ),
      { status: 500 }
    );
  }
}
