import "server-only";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getSupabasePublicEnv } from "./env";

export function createAdminClient() {
  const { url } = getSupabasePublicEnv();
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SECRET_KEY environment variable is missing");
  }
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export function verifySameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return true; // non-browser or direct curl
  try {
    const originHost = new URL(origin).host;
    return originHost === host;
  } catch {
    return false;
  }
}
