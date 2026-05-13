/**
 * Per-card feedback writes.
 *
 * POST inserts a feedback row; DELETE removes one (for the Undo flow).
 * Both run via the user-scoped Supabase client (anon-key + stub JWT)
 * — NOT the service role — so RLS evaluates the operation. That means
 * the route physically can't:
 *
 *   - Write a row with a forged user_id (the WITH CHECK policy on
 *     feedback enforces `user_id = auth.uid()`)
 *   - Delete another user's row (the USING policy filters by owner)
 *
 * In v1 the stub JWT always resolves to `PODIUM_USER_ID`, so the route
 * can't actually be exploited; the value of the pattern is that v3
 * swaps in real auth without policy changes.
 *
 * Card-level feedback only in v1. Segment-level lands in v2; the
 * schema (`feedback.segment_id`) already supports it.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const VERDICTS = ["not_relevant", "not_substantive", "love"] as const;

const PostBodySchema = z.object({
  cardId: z.string().uuid(),
  verdict: z.enum(VERDICTS),
});

const DeleteBodySchema = z.object({
  feedbackId: z.string().uuid(),
});

export async function POST(request: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = PostBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServerClient();
  // feedback.user_id is NOT NULL with no auto-fill trigger (0005 dropped
  // the residual auth.users handler). Set it explicitly here; v3 swaps
  // env.PODIUM_USER_ID for the JWT sub from the real auth context. The
  // RLS WITH CHECK policy verifies `user_id = auth.uid()` regardless.
  const { data, error } = await supabase
    .from("feedback")
    .insert({
      user_id: env.PODIUM_USER_ID,
      card_id: parsed.data.cardId,
      verdict: parsed.data.verdict,
    })
    .select("id")
    .single();

  if (error) {
    // RLS violations surface as code 42501; anything else is server-side.
    const status = error.code === "42501" ? 403 : 500;
    return NextResponse.json(
      { error: error.code === "42501" ? "forbidden" : "insert_failed" },
      { status },
    );
  }
  return NextResponse.json({ id: data.id as string }, { status: 200 });
}

export async function DELETE(request: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = DeleteBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("feedback")
    .delete()
    .eq("id", parsed.data.feedbackId);

  if (error) {
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }
  return new Response(null, { status: 204 });
}
