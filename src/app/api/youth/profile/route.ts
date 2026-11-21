import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/require-user";
import { createAdminClient, jsonError, verifySameOrigin } from "@/lib/supabase/admin";
import { encryptPii } from "@/server/auth/crypto";
import { getDecryptedYouthProfile } from "@/server/auth/youth-profile";
import { CATEGORY_IDS } from "@/contracts/matching";

const NO_STORE = { "Cache-Control": "private, no-store" };

const AddressSchema = z.object({
  sido: z.string().trim().min(1).max(50),
  sigungu: z.string().trim().min(1).max(50),
});
const CategoriesSchema = z
  .array(z.enum(CATEGORY_IDS))
  .min(1)
  .max(3)
  .refine((v) => new Set(v).size === v.length, "duplicate categories");
const NameSchema = z.string().trim().min(1).max(100);
const BirthDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !Number.isNaN(Date.parse(v)) && new Date(v) <= new Date(), "invalid date");

const CreateSchema = z.object({
  name: NameSchema,
  birth_date: BirthDateSchema,
  address: AddressSchema,
  desired_categories: CategoriesSchema,
});
const UpdateSchema = z
  .object({
    name: NameSchema.optional(),
    birth_date: BirthDateSchema.optional(),
    address: AddressSchema.optional(),
    desired_categories: CategoriesSchema.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "empty update");

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

// Y02: GET /api/youth/profile
export async function GET() {
  const session = await requireUser();
  if (!session) return jsonError(401, "UNAUTHORIZED", "로그인이 필요합니다.");

  const admin = createAdminClient();
  const profile = await getDecryptedYouthProfile(admin, session.user.id, session.user.email);
  if (!profile) return jsonError(409, "ONBOARDING_REQUIRED", "온보딩을 먼저 완료해주세요.");

  return NextResponse.json(profile, { headers: NO_STORE });
}

// Y01: POST /api/youth/profile
export async function POST(request: Request) {
  if (!verifySameOrigin(request)) {
    return jsonError(403, "ORIGIN_FORBIDDEN", "요청 출처가 올바르지 않습니다.");
  }

  const session = await requireUser();
  if (!session) return jsonError(401, "UNAUTHORIZED", "로그인이 필요합니다.");

  const body = await readJson(request);
  if (!body || typeof body !== "object") {
    return jsonError(400, "VALIDATION_ERROR", "요청 본문이 올바르지 않습니다.");
  }
  if ((body as { privacy_consent?: unknown }).privacy_consent !== true) {
    return jsonError(400, "CONSENT_REQUIRED", "개인정보 수집 및 이용 동의가 필요합니다.");
  }
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "VALIDATION_ERROR", "입력값이 올바르지 않습니다.");
  }
  const { name, birth_date, address, desired_categories } = parsed.data;

  try {
    const admin = createAdminClient();
    const userId = session.user.id;

    const { data: existingProfile } = await admin
      .from("profiles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    if (existingProfile?.role === "company") {
      return jsonError(403, "ROLE_FORBIDDEN", "기업 계정은 청년 프로필을 만들 수 없습니다.");
    }

    const { data: existingYouth } = await admin
      .from("youth_profiles")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (existingYouth) {
      return jsonError(409, "PROFILE_ALREADY_EXISTS", "이미 프로필이 등록되어 있습니다.");
    }

    const { error: profileErr } = await admin
      .from("profiles")
      .upsert({ user_id: userId, role: "youth" }, { onConflict: "user_id" });
    if (profileErr) throw profileErr;

    const { error: youthErr } = await admin.from("youth_profiles").insert({
      user_id: userId,
      name_cipher: encryptPii(name),
      birth_date_cipher: encryptPii(birth_date),
      address_cipher: encryptPii(JSON.stringify(address)),
      privacy_consent_at: new Date().toISOString(),
      profile_version: 1,
    });
    if (youthErr) throw youthErr;

    const { error: catErr } = await admin
      .from("youth_categories")
      .insert(desired_categories.map((slug) => ({ user_id: userId, category_slug: slug })));
    if (catErr) throw catErr;

    const fullProfile = await getDecryptedYouthProfile(admin, userId, session.user.email);
    return NextResponse.json(fullProfile, { status: 201, headers: NO_STORE });
  } catch (err) {
    console.error("POST /api/youth/profile error:", err);
    return jsonError(500, "INTERNAL_ERROR", "프로필 생성에 실패했습니다.");
  }
}

// Y03: PATCH /api/youth/profile
export async function PATCH(request: Request) {
  if (!verifySameOrigin(request)) {
    return jsonError(403, "ORIGIN_FORBIDDEN", "요청 출처가 올바르지 않습니다.");
  }

  const session = await requireUser();
  if (!session) return jsonError(401, "UNAUTHORIZED", "로그인이 필요합니다.");

  const parsed = UpdateSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return jsonError(400, "VALIDATION_ERROR", "입력값이 올바르지 않습니다.");
  }
  const { name, birth_date, address, desired_categories } = parsed.data;

  try {
    const admin = createAdminClient();
    const userId = session.user.id;

    const existing = await getDecryptedYouthProfile(admin, userId, session.user.email);
    if (!existing) return jsonError(409, "ONBOARDING_REQUIRED", "온보딩을 먼저 완료해주세요.");

    const updates: Record<string, unknown> = {
      profile_version: existing.profile_version + 1,
      updated_at: new Date().toISOString(),
    };
    if (name !== undefined) updates.name_cipher = encryptPii(name);
    if (birth_date !== undefined) updates.birth_date_cipher = encryptPii(birth_date);
    if (address !== undefined) updates.address_cipher = encryptPii(JSON.stringify(address));

    const { error: updErr } = await admin.from("youth_profiles").update(updates).eq("user_id", userId);
    if (updErr) throw updErr;

    if (desired_categories !== undefined) {
      const { error: delErr } = await admin.from("youth_categories").delete().eq("user_id", userId);
      if (delErr) throw delErr;
      const { error: insErr } = await admin
        .from("youth_categories")
        .insert(desired_categories.map((slug) => ({ user_id: userId, category_slug: slug })));
      if (insErr) throw insErr;
    }

    // 매칭 캐시 무효화 (기존 applications 스냅샷은 불변)
    await admin.from("match_results").delete().eq("youth_user_id", userId);

    const updated = await getDecryptedYouthProfile(admin, userId, session.user.email);
    return NextResponse.json(updated, { headers: NO_STORE });
  } catch (err) {
    console.error("PATCH /api/youth/profile error:", err);
    return jsonError(500, "INTERNAL_ERROR", "프로필 수정에 실패했습니다.");
  }
}
