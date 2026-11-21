// scripts/seed_demo_accounts.mjs
// 시연용 가상 계정 시드 (멱등 실행). 이력서 PDF / AI 분석(matching_json)은 포함하지 않습니다.
//   - 로그인 Auth 유저 + profiles + (청년) youth_profiles·youth_categories + (기업) company_accounts 까지만 생성
//   - Youth C(최윤서)는 JSON상 live_signup(시연 중 직접 가입)이므로 사전 시드에서 제외
// 실행: node scripts/seed_demo_accounts.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createCipheriv, randomBytes, createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- .env.local 로드 ---
const envPath = resolve(__dirname, "../.env.local");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const secret = env.SUPABASE_SECRET_KEY;
if (!url || !secret) { console.error("❌ .env.local 에 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY 가 필요합니다."); process.exit(1); }
const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

// --- PII 암호화 (src/server/auth/crypto.ts 와 동일 포맷: iv:tag:cipher hex) ---
function encryptPii(plain) {
  const key = createHash("sha256").update(env.PII_ENCRYPTION_KEY || "default-secret-key-32bytes-for-dev!!").digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  let enc = cipher.update(plain, "utf8", "hex");
  enc += cipher.final("hex");
  return `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${enc}`;
}

// --- job_groups(한글) → category slug ---
const CATEGORY_BY_LABEL = {
  "경영·기획·인사": "management_hr", "회계·재무": "accounting_finance", "마케팅·홍보": "marketing_pr",
  "영업·고객관리": "sales_customer", "상품기획·MD": "product_md", "IT개발·데이터": "it_data",
  "디자인": "design", "연구개발·설계": "rnd_engineering", "생산·품질": "production_quality",
  "구매·물류·무역": "procurement_logistics_trade", "건축·토목·환경": "construction_civil_env",
  "의료·보건": "medical_health", "교육": "education", "미디어·콘텐츠": "media_content", "기타": "other",
};

// --- 시연 계정 데이터 (demo JSON 기준, Youth C는 live_signup 이라 제외) ---
const YOUTHS = [
  { email: "demo.youth.a@example.com", password: "Demo-SpX8VL6bpJ", name: "이하늘",
    birth_date: "1997-03-14", sido: "서울특별시", sigungu: "마포구", job_groups: ["마케팅·홍보", "영업·고객관리"] },
  { email: "demo.youth.b@example.com", password: "Demo-H8WmdTKfVi", name: "박지호",
    birth_date: "1995-08-22", sido: "경기도", sigungu: "고양시 덕양구", job_groups: ["마케팅·홍보"] },
];
const COMPANY = {
  email: "demo.company.blendx@example.com", password: "Demo-ClVk2RrSsd", company_name_norm: "블렌드엑스", company_gu: "강남구",
};

// --- Auth 유저 멱등 생성 (있으면 비밀번호만 갱신) ---
async function ensureAuthUser(email, password) {
  const { data: list, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const found = list.users.find((u) => u.email === email);
  if (found) {
    await admin.auth.admin.updateUserById(found.id, { password, email_confirm: true });
    return { id: found.id, created: false };
  }
  const { data, error: cErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (cErr) throw cErr;
  return { id: data.user.id, created: true };
}

async function seedYouth(y) {
  const { id, created } = await ensureAuthUser(y.email, y.password);
  await admin.from("profiles").upsert({ user_id: id, role: "youth" });
  await admin.from("youth_profiles").upsert({
    user_id: id,
    name_cipher: encryptPii(y.name),
    birth_date_cipher: encryptPii(y.birth_date),
    address_cipher: encryptPii(JSON.stringify({ sido: y.sido, sigungu: y.sigungu })),
    privacy_consent_at: new Date().toISOString(),
    profile_version: 1,
  });
  const slugs = y.job_groups.map((g) => CATEGORY_BY_LABEL[g]).filter(Boolean);
  await admin.from("youth_categories").delete().eq("user_id", id);
  if (slugs.length) {
    await admin.from("youth_categories").insert(slugs.map((category_slug) => ({ user_id: id, category_slug })));
  }
  console.log(`  ${created ? "➕ 생성" : "♻️  갱신"}  [청년] ${y.name.padEnd(4)} ${y.email}  관심직무=${slugs.join(",")}`);
}

async function seedCompany(c) {
  const { data: company } = await admin.from("companies").select("id,name").eq("name_norm", c.company_name_norm).eq("gu", c.company_gu).maybeSingle();
  if (!company) throw new Error(`기업을 찾을 수 없음: ${c.company_name_norm} (${c.company_gu})`);
  const { id, created } = await ensureAuthUser(c.email, c.password);
  await admin.from("profiles").upsert({ user_id: id, role: "company" });
  await admin.from("company_accounts").upsert({ user_id: id, company_id: company.id });
  console.log(`  ${created ? "➕ 생성" : "♻️  갱신"}  [기업] ${company.name}  ${c.email}  → ${company.id}`);
}

console.log("=== 시연용 가상 계정 시드 (이력서/AI 제외) ===");
for (const y of YOUTHS) await seedYouth(y);
await seedCompany(COMPANY);
console.log("\n✅ 완료. (Youth C 최윤서는 live_signup 이라 사전 시드에서 제외)");
console.log("   로그인은 각 계정의 email/password 로 가능. 이력서는 미등록 상태(앱 Y04에서 업로드).");
