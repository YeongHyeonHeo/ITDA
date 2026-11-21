import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/require-user";
import { createAdminClient, jsonError } from "@/lib/supabase/admin";
import type { MeResponse } from "@/contracts/api";

// A01: GET /api/me — 현재 로그인 사용자의 역할과 온보딩 완료 여부
export async function GET() {
  const auth = await requireUser();
  if (!auth) {
    return jsonError(401, "UNAUTHORIZED", "로그인이 필요합니다.");
  }
  const { user } = auth;

  // 소유권 검증(requireUser)을 마친 뒤 service_role로 읽는다. (RLS 우회이므로 user.id로만 조회)
  const admin = createAdminClient();

  const { data: profile, error } = await admin
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return jsonError(500, "INTERNAL_ERROR", "프로필 조회 중 오류가 발생했습니다.");
  }

  // 온보딩 전: profiles 행이 없음
  if (!profile) {
    const body: MeResponse = {
      user_id: user.id,
      role: null,
      onboarding_complete: false,
      company_ids: [],
    };
    return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
  }

  if (profile.role === "company") {
    const { data: links } = await admin
      .from("company_accounts")
      .select("company_id")
      .eq("user_id", user.id);

    const body: MeResponse = {
      user_id: user.id,
      role: "company",
      onboarding_complete: true,
      company_ids: (links ?? []).map((l) => l.company_id as string),
    };
    return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
  }

  // role === 'youth': youth_profiles 존재 여부로 온보딩 완료 판정
  const { data: youth } = await admin
    .from("youth_profiles")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const body: MeResponse = {
    user_id: user.id,
    role: "youth",
    onboarding_complete: Boolean(youth),
    company_ids: [],
  };
  return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
}
