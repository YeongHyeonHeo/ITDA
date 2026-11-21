import "server-only";
import { NextResponse } from "next/server";
import { createAdminClient, jsonError } from "@/lib/supabase/admin";

// GET /api/companies?q= — 기업 회원가입 시 선택할 서울형 강소기업 목록 조회
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() || "";

  const admin = createAdminClient();
  let query = admin
    .from("companies")
    .select("id, name, gu, business_desc, is_demo")
    .order("name", { ascending: true })
    .limit(300);

  if (q) {
    query = query.ilike("name", `%${q}%`);
  }

  const { data, error } = await query;
  if (error) {
    return jsonError(500, "DB_ERROR", "기업 목록을 불러오는데 실패했습니다.");
  }

  return NextResponse.json({
    companies: (data ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      gu: c.gu ?? null,
      industry: c.business_desc ?? null,
      is_demo: Boolean(c.is_demo),
      participation: c.is_demo ? "participating" : "non_participating",
    })),
  });
}
