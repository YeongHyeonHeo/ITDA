// scripts/test_local.js
// Mock server-only so we can run outside of Next.js server runtime
require.cache[require.resolve("server-only")] = {
  id: require.resolve("server-only"),
  filename: require.resolve("server-only"),
  loaded: true,
  exports: {},
};

// Load .env.local
const fs = require("fs");
const path = require("path");
const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const idx = trimmed.indexOf("=");
      if (idx > 0) {
        const k = trimmed.slice(0, idx).trim();
        const v = trimmed.slice(idx + 1).trim();
        process.env[k] = v;
      }
    }
  }
}

const { createCipheriv, createDecipheriv, randomBytes, createHash } = require("crypto");
const { createClient } = require("@supabase/supabase-js");

console.log("=================================================");
console.log("🚀 [서울잇다 / JOB잇다] 백엔드 로컬 통합 테스트 시작");
console.log("=================================================\n");

// -------------------------------------------------------------------
// 1. PII 암호화 / 복호화 테스트
// -------------------------------------------------------------------
console.log("▶ 1. PII 암복호화 (AES-256-GCM) 테스트");
function getKey() {
  const secret = process.env.PII_ENCRYPTION_KEY || "default-secret-key-32bytes-for-dev!!";
  return createHash("sha256").update(secret).digest();
}
function encryptPii(plainText) {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(plainText, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${tag}:${encrypted}`;
}
function decryptPii(cipherText) {
  try {
    const [ivHex, tagHex, encryptedHex] = cipherText.split(":");
    if (!ivHex || !tagHex || !encryptedHex) return cipherText;
    const key = getKey();
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    return cipherText;
  }
}

const sampleBirth = "1997-03-14";
const sampleAddress = JSON.stringify({ sido: "서울특별시", sigungu: "마포구" });
const encBirth = encryptPii(sampleBirth);
const decBirth = decryptPii(encBirth);
const encAddr = encryptPii(sampleAddress);
const decAddr = decryptPii(encAddr);

console.log("  - 원본 생년월일:", sampleBirth);
console.log("  - 암호문 (DB 저장형태):", encBirth);
console.log("  - 복호화 결과:", decBirth, decBirth === sampleBirth ? "✅ 일치" : "❌ 불일치");
console.log("  - 복호화 주소:", decAddr, decAddr === sampleAddress ? "✅ 일치" : "❌ 불일치");
console.log();

// -------------------------------------------------------------------
// 2. 정책 판정 로직 테스트 (PRD v1.4 시연 지원자 5인 시나리오 검증)
// -------------------------------------------------------------------
console.log("▶ 2. 정책 기본요건 예비진단 (시연 지원자 5인 시나리오) 테스트");

function calcKoreanAge(birthDateStr, asOfDate = new Date()) {
  const parts = birthDateStr.split("-").map(Number);
  if (parts.length !== 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) return 0;
  const [bYear, bMonth, bDay] = parts;
  const currentYear = asOfDate.getFullYear();
  const currentMonth = asOfDate.getMonth() + 1;
  const currentDay = asOfDate.getDate();
  let age = currentYear - bYear;
  if (currentMonth < bMonth || (currentMonth === bMonth && currentDay < bDay)) age--;
  return Math.max(0, age);
}

function evaluateYouthPolicy({ age, birthDate, sido }) {
  let ageItem = "unknown";
  if (age > 0) {
    if (age < 17 || age >= 40) {
      ageItem = "fail";
    } else {
      let isBoundary = false;
      if (birthDate) {
        const today = new Date();
        const sixMonthsLater = new Date(today.getTime() + 180 * 24 * 60 * 60 * 1000);
        const ageIn6Months = calcKoreanAge(birthDate, sixMonthsLater);
        if (age === 17 && ageIn6Months >= 18) isBoundary = true;
        else if (age === 39 && ageIn6Months >= 40) isBoundary = true;
      }
      if (isBoundary) ageItem = "unknown";
      else if (age >= 18 && age <= 39) ageItem = "pass";
      else ageItem = "fail";
    }
  }

  const isSeoul = sido === "서울특별시" || sido === "서울" || sido === "서울시";
  const residenceItem = sido ? (isSeoul ? "pass" : "fail") : "unknown";

  let status = "needs_check";
  if (ageItem === "fail" || residenceItem === "fail") status = "ineligible";
  else if (ageItem === "pass" && residenceItem === "pass") status = "eligible";
  else status = "needs_check";

  return { status, items: { age: ageItem, residence: residenceItem } };
}

const demoCandidates = [
  { name: "A 강서울", birth: "1997-03-14", sido: "서울특별시", expected: "eligible" },
  { name: "B 박지호", birth: "1995-08-22", sido: "서울특별시", expected: "eligible" },
  { name: "C 최윤서", birth: "1987-03-10", sido: "서울특별시", expected: "needs_check" }, // 39세, 4개월 뒤 40세 도달
  { name: "D 한서진", birth: "1999-06-18", sido: "서울특별시", expected: "eligible" },
  { name: "E 윤채원", birth: "1985-04-12", sido: "서울특별시", expected: "ineligible" }, // 41세
];

for (const c of demoCandidates) {
  const age = calcKoreanAge(c.birth);
  const res = evaluateYouthPolicy({ age, birthDate: c.birth, sido: c.sido });
  const ok = res.status === c.expected;
  console.log(`  - [${c.name}] 생년: ${c.birth} (만 ${age}세) -> 상태: ${res.status} (연령: ${res.items.age}) [${ok ? "✅ 통과" : "❌ 불일치"}]`);
}
console.log();

// -------------------------------------------------------------------
// 3. Supabase DB 연결 및 데이터 현황 확인
// -------------------------------------------------------------------
console.log("▶ 3. Supabase 연결 및 DB 테이블 현황 확인");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !secretKey) {
  console.log("  ⚠️ SUPABASE_SECRET_KEY 또는 NEXT_PUBLIC_SUPABASE_URL이 .env.local에 없습니다.");
} else {
  console.log("  - Supabase URL:", supabaseUrl);
  const client = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  async function checkDb() {
    try {
      const tables = ["companies", "jobs", "job_categories", "profiles", "youth_profiles", "resume_versions", "applications"];
      for (const t of tables) {
        const { count, error } = await client.from(t).select("*", { count: "exact", head: true });
        if (error) {
          console.log(`  - 테이블 [${t}]: ⚠️ 조회 오류 (${error.message})`);
        } else {
          console.log(`  - 테이블 [${t}]: ✅ 정상 존재 (${count} 건 적재됨)`);
        }
      }
    } catch (e) {
      console.log("  - DB 연결 예외:", e.message);
    }
  }

  checkDb().then(() => {
    console.log("\n=================================================");
    console.log("🎉 백엔드 로컬 통합 테스트 완료");
    console.log("=================================================");
  });
}
