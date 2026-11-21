import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/require-user";
import { createAdminClient, jsonError, verifySameOrigin } from "@/lib/supabase/admin";
import type { CompanyProfileResponse } from "@/contracts/api";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CreateCompanySchema = z.object({
  company_id: z.string().regex(UUID_RE, "company_id must be a UUID"),
});

// POST /api/company/profile — 기업 회원가입(온보딩): 기업 연결 + 참여 상태(is_demo=true) 활성화
export async function POST(request: Request) {
  if (!verifySameOrigin(request)) {
    return jsonError(403, "ORIGIN_FORBIDDEN", "요청 출처가 올바르지 않습니다.");
  }

  const auth = await requireUser();
  if (!auth) {
    return jsonError(401, "UNAUTHORIZED", "로그인이 필요합니다.");
  }
  const { user } = auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "VALIDATION_ERROR", "요청 본문이 올바른 JSON이 아닙니다.");
  }
  const parsed = CreateCompanySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "VALIDATION_ERROR", "올바른 company_id를 입력해주세요.");
  }
  const { company_id } = parsed.data;

  try {
    const admin = createAdminClient();

    // 1. 기존 역할 / 연결 확인
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingProfile?.role === "youth") {
      return jsonError(403, "ROLE_FORBIDDEN", "청년 계정은 기업 회원가입을 할 수 없습니다.");
    }

    const { data: existingLink } = await admin
      .from("company_accounts")
      .select("company_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingLink) {
      return jsonError(409, "PROFILE_ALREADY_EXISTS", "이미 기업 계정 온보딩이 완료되어 있습니다.");
    }

    // 2. 대상 강소기업 확인
    const { data: company } = await admin
      .from("companies")
      .select("id, name, business_desc, gu")
      .eq("id", company_id)
      .maybeSingle();

    if (!company) {
      return jsonError(404, "COMPANY_NOT_FOUND", "존재하지 않는 서울형 강소기업입니다.");
    }

    // 3. profiles upsert + company_accounts insert + companies 참여 상태(is_demo=true) 전환
    const { error: profileErr } = await admin
      .from("profiles")
      .upsert({ user_id: user.id, role: "company" }, { onConflict: "user_id" });
    if (profileErr) throw profileErr;

    const { error: linkErr } = await admin
      .from("company_accounts")
      .insert({ user_id: user.id, company_id });
    if (linkErr) throw linkErr;

    // 002_company_participation.sql 트리거가 없더라도 코드 레벨에서 is_demo=true 즉시 반영
    const { error: compErr } = await admin
      .from("companies")
      .update({ is_demo: true, updated_at: new Date().toISOString() })
      .eq("id", company_id);
    if (compErr) throw compErr;

    const resBody: CompanyProfileResponse = {
      user_id: user.id,
      role: "company",
      company: {
        id: company.id,
        name: company.name,
        industry: company.business_desc ?? null,
        gu: company.gu ?? null,
        is_demo: true,
        participation: "participating",
      },
    };
    return NextResponse.json(resBody, {
      status: 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    console.error("POST /api/company/profile error:", err);
    return jsonError(500, "INTERNAL_ERROR", "기업 회원가입 처리 중 오류가 발생했습니다.");
  }
}
