import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptPii, calcKoreanAge } from "./crypto";
import { evaluateYouthPolicy } from "../policy/evaluate";
import type { CategoryId, ExtractionStatus, ResumeMatchingJson } from "@/contracts/matching";
import type { ProfileResponse } from "@/contracts/api";

export async function getDecryptedYouthProfile(
  supabase: SupabaseClient,
  userId: string,
  emailHint?: string
): Promise<ProfileResponse | null> {
  // 1. Fetch youth_profile
  const { data: youthRow } = await supabase
    .from("youth_profiles")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!youthRow) return null;

  // 2. Fetch categories
  const { data: catRows } = await supabase
    .from("youth_categories")
    .select("category_slug")
    .eq("user_id", userId);

  const desired_categories = (catRows || []).map((r) => r.category_slug as CategoryId);

  // 3. Decrypt PII
  const name = youthRow.name_cipher ? decryptPii(youthRow.name_cipher) : "사용자";
  const birth_date = decryptPii(youthRow.birth_date_cipher);
  const age = calcKoreanAge(birth_date);

  let address = { sido: "서울특별시", sigungu: "" };
  if (youthRow.address_cipher) {
    try {
      const decAddress = decryptPii(youthRow.address_cipher);
      const parsed = JSON.parse(decAddress);
      if (parsed && typeof parsed === "object") {
        address = {
          sido: parsed.sido || "서울특별시",
          sigungu: parsed.sigungu || "",
        };
      }
    } catch {
      address = { sido: "서울특별시", sigungu: youthRow.address_cipher || "" };
    }
  }

  // 4. Fetch email if not provided
  let email = emailHint || "";
  if (!email) {
    try {
      const { data: authUser } = await supabase.auth.admin.getUserById(userId);
      email = authUser?.user?.email || "";
    } catch {
      // ignore
    }
  }

  // 5. Fetch current resume if attached
  let resume = null;
  if (youthRow.current_resume_id) {
    const { data: resumeRow } = await supabase
      .from("resume_versions")
      .select("*")
      .eq("id", youthRow.current_resume_id)
      .eq("youth_user_id", userId)
      .single();

    if (resumeRow) {
      resume = {
        resume_id: resumeRow.id,
        filename: resumeRow.original_filename,
        uploaded_at: resumeRow.created_at,
        extraction_status: resumeRow.extraction_status as ExtractionStatus,
        extraction_error: resumeRow.extraction_error
          ? { code: "EXTRACTION_FAILED", message: resumeRow.extraction_error }
          : null,
        matching_json: resumeRow.matching_json as ResumeMatchingJson | null,
        profile_version: youthRow.profile_version,
      };
    }
  }

  const youth_policy = evaluateYouthPolicy({
    age,
    birthDate: birth_date,
    sido: address.sido,
    sigungu: address.sigungu,
  });

  return {
    user_id: userId,
    name,
    email,
    birth_date,
    age,
    address,
    desired_categories,
    youth_policy,
    profile_version: youthRow.profile_version,
    privacy_consent_at: youthRow.privacy_consent_at,
    resume,
  };
}
