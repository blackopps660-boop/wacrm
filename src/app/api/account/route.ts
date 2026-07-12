// ============================================================
// /api/account
//
//   GET   — current caller's account + role. Any member.
//   PATCH — rename the account, and/or toggle its lock. Admin+.
//
// Why both verbs share a route file
//   They speak about the same singular resource (the caller's
//   account) and reuse the same `requireRole` plumbing. Splitting
//   them across files would duplicate the `account_id` lookup
//   without buying anything.
// ============================================================

import { NextResponse } from "next/server";

import {
  requireRole,
  getCurrentAccount,
  toErrorResponse,
} from "@/lib/auth/account";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";

export async function GET() {
  try {
    const ctx = await getCurrentAccount();

    const { data, error } = await ctx.supabase
      .from("accounts")
      .select("id, name, is_locked")
      .eq("id", ctx.accountId)
      .single();

    if (error) {
      console.error("[GET /api/account] lookup error:", error);
      return NextResponse.json(
        { error: "Failed to load account" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      account: data,
      role: ctx.role,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

const MAX_NAME_LEN = 80;

export async function PATCH(request: Request) {
  try {
    const ctx = await requireRole("admin");

    // Per-user limit on admin-class mutations. Bounds accidental
    // abuse (script run in a loop) and a compromised admin session
    // spamming renames. Each admin endpoint keys its own bucket so
    // one route doesn't starve another.
    const limit = checkRateLimit(
      `admin:rename:${ctx.userId}`,
      RATE_LIMITS.adminAction,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as
      | { name?: unknown; is_locked?: unknown }
      | null;

    // Read the current lock state up front — a rename attempt while
    // locked should fail even if this same request isn't also the
    // one flipping the lock, and an unlock+rename combined in one
    // request should succeed (the new lock value below applies before
    // the name check).
    const { data: current, error: currentErr } = await ctx.supabase
      .from("accounts")
      .select("is_locked")
      .eq("id", ctx.accountId)
      .single();
    if (currentErr) {
      console.error("[PATCH /api/account] lock lookup error:", currentErr);
      return NextResponse.json(
        { error: "Failed to load account" },
        { status: 500 },
      );
    }

    const update: Record<string, unknown> = {};

    if (body?.is_locked !== undefined) {
      if (typeof body.is_locked !== "boolean") {
        return NextResponse.json(
          { error: "'is_locked' must be a boolean" },
          { status: 400 },
        );
      }
      update.is_locked = body.is_locked;
    }

    const willBeLocked = (update.is_locked as boolean | undefined) ?? current.is_locked;

    if (body?.name !== undefined) {
      if (willBeLocked) {
        return NextResponse.json(
          { error: "Workspace is locked — unlock it before renaming." },
          { status: 423 },
        );
      }
      if (typeof body.name !== "string") {
        return NextResponse.json(
          { error: "'name' must be a string" },
          { status: 400 },
        );
      }
      const name = body.name.trim();
      if (name.length === 0) {
        return NextResponse.json(
          { error: "Account name cannot be empty" },
          { status: 400 },
        );
      }
      if (name.length > MAX_NAME_LEN) {
        return NextResponse.json(
          { error: `Account name must be ${MAX_NAME_LEN} characters or fewer` },
          { status: 400 },
        );
      }
      update.name = name;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { error: "Nothing to update — provide 'name' and/or 'is_locked'" },
        { status: 400 },
      );
    }

    // RLS allows this UPDATE because accounts_update requires
    // `is_account_member(id, 'admin')`, and requireRole already
    // guaranteed the caller is admin+.
    const { data, error } = await ctx.supabase
      .from("accounts")
      .update(update)
      .eq("id", ctx.accountId)
      .select("id, name, is_locked")
      .single();

    if (error) {
      console.error("[PATCH /api/account] update error:", error);
      return NextResponse.json(
        { error: "Failed to update account" },
        { status: 500 },
      );
    }

    return NextResponse.json({ account: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}
