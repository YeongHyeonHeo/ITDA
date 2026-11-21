// scripts/test_e2e_api.js
// JOB잇다 (서울잇다) Track 1 + Track 2 전체 13개 API (T01~T30) E2E 통합 테스트
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

// 1. Load .env.local
const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const idx = trimmed.indexOf("=");
      if (idx > 0) {
        process.env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
      }
    }
  }
}

const BASE_URL = "http://localhost:3000";
const PDF_PATH = path.resolve(__dirname, "../이력서_A_강서울_디지털캠페인AE.pdf");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !secretKey || !publishableKey) {
  console.error("❌ .env.local에 Supabase 환경변수가 부족합니다.");
  process.exit(1);
}

const adminClient = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const authClient = createClient(supabaseUrl, publishableKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let passed = 0;
let failed = 0;
function assert(cond, code, label, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✅ [${code}] ${label}${detail ? ` (${detail})` : ""}`);
  } else {
    failed++;
    console.error(`  ❌ [${code}] ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function createAndLoginUser(email, password) {
  const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created?.user) {
    throw new Error(`계정 생성 실패 (${email}): ${createErr?.message}`);
  }
  const { data: signIn, error: signInErr } = await authClient.auth.signInWithPassword({
    email,
    password,
  });
  if (signInErr || !signIn?.session) {
    throw new Error(`로그인 실패 (${email}): ${signInErr?.message}`);
  }
  return {
    id: created.user.id,
    email,
    token: signIn.session.access_token,
  };
}

async function run() {
  console.log("==========================================================");
  console.log("🧪 [JOB잇다] 전체 13개 API (T01~T30) E2E 통합 테스트 시작");
  console.log("==========================================================\n");

  const stamp = Date.now();
  const createdUserIds = [];
  const uploadedStoragePaths = [];
  let blendxCompanyId = null;
  let originalBlendxIsDemo = false;

  try {
    // --------------------------------------------------------
    // Phase 0. 헬스체크 & DB 시드 점검 (T01~T03)
    // --------------------------------------------------------
    console.log("▶ Phase 0. 서버 헬스체크 & DB 시드 상태 점검");
    const healthRes = await fetch(`${BASE_URL}/api/health`);
    const healthJson = await healthRes.json();
    assert(
      healthRes.status === 200 && healthJson.status === "ok",
      "T01",
      "GET /api/health → 200 ok",
      JSON.stringify(healthJson)
    );

    const [cCnt, jCnt, catCnt, jpCnt] = await Promise.all([
      adminClient.from("companies").select("*", { count: "exact", head: true }),
      adminClient.from("jobs").select("*", { count: "exact", head: true }),
      adminClient.from("job_categories").select("*", { count: "exact", head: true }),
      adminClient.from("job_post_categories").select("*", { count: "exact", head: true }),
    ]);
    assert(
      cCnt.count === 256 && jCnt.count === 81 && catCnt.count === 15 && (jpCnt.count ?? 0) >= 200,
      "T02",
      "DB 시드 테이블 건수 확인",
      `companies=${cCnt.count}, jobs=${jCnt.count}, categories=${catCnt.count}, job_post_categories=${jpCnt.count}`
    );

    const { data: blendxOpen } = await adminClient
      .from("jobs")
      .select("id, company_id, title")
      .ilike("company_name", "%블렌드엑스%")
      .ilike("title", "%디지털 캠페인 AE%")
      .eq("status", "open")
      .eq("match_status", "verified")
      .limit(1)
      .single();

    const { data: closedJob } = await adminClient
      .from("jobs")
      .select("id, title")
      .eq("match_status", "verified")
      .eq("status", "closed")
      .limit(1)
      .single();

    const { data: otherJob } = await adminClient
      .from("jobs")
      .select("id, company_name, title")
      .eq("match_status", "verified")
      .not("company_name", "ilike", "%블렌드엑스%")
      .limit(1)
      .single();

    const { data: otherOpenJob } = await adminClient
      .from("jobs")
      .select("id, company_name, title, source")
      .eq("match_status", "verified")
      .eq("status", "open")
      .not("company_name", "ilike", "%블렌드엑스%")
      .limit(1)
      .single();

    const { data: blendxCompRow } = await adminClient
      .from("companies")
      .select("id, is_demo")
      .eq("id", blendxOpen.company_id)
      .single();
    blendxCompanyId = blendxCompRow?.id || null;
    originalBlendxIsDemo = Boolean(blendxCompRow?.is_demo);

    assert(
      Boolean(blendxOpen?.id && closedJob?.id && otherJob?.id && otherOpenJob?.id),
      "T03",
      "대상 공고(블렌드엑스 AE, 마감 공고, 타사 공고, 미참여 열림 공고) 확보",
      `open=${blendxOpen?.id}, closed=${closedJob?.id}, nonPart=${otherOpenJob?.company_name}`
    );

    // --------------------------------------------------------
    // 임시 계정 3종 생성 (Youth A, Youth C, Company BlendX)
    // --------------------------------------------------------
    const youthA = await createAndLoginUser(`e2e_a_${stamp}@itda.kr`, `PassA_${stamp}!`);
    createdUserIds.push(youthA.id);
    const youthC = await createAndLoginUser(`e2e_c_${stamp}@itda.kr`, `PassC_${stamp}!`);
    createdUserIds.push(youthC.id);
    const companyUser = await createAndLoginUser(`e2e_co_${stamp}@itda.kr`, `PassCo_${stamp}!`);
    createdUserIds.push(companyUser.id);

    const authA = { Authorization: `Bearer ${youthA.token}` };
    const jsonA = { ...authA, "Content-Type": "application/json" };
    const authC = { Authorization: `Bearer ${youthC.token}` };
    const jsonC = { ...authC, "Content-Type": "application/json" };
    const authCo = { Authorization: `Bearer ${companyUser.token}` };
    const jsonCo = { ...authCo, "Content-Type": "application/json" };

    // Company BlendX 회원가입 API 테스트 (GET /api/companies + POST /api/company/profile 401/404/201/409)
    const compListRes = await fetch(`${BASE_URL}/api/companies?q=블렌드엑스`);
    const compListJson = await compListRes.json();

    const coNoAuthRes = await fetch(`${BASE_URL}/api/company/profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company_id: blendxOpen.company_id }),
    });

    const coNotFoundRes = await fetch(`${BASE_URL}/api/company/profile`, {
      method: "POST",
      headers: jsonCo,
      body: JSON.stringify({ company_id: "00000000-0000-4000-8000-000000000000" }),
    });
    const coNotFoundJson = await coNotFoundRes.json();

    const coJoinRes = await fetch(`${BASE_URL}/api/company/profile`, {
      method: "POST",
      headers: jsonCo,
      body: JSON.stringify({ company_id: blendxOpen.company_id }),
    });
    const coJoinJson = await coJoinRes.json();

    const coDupRes = await fetch(`${BASE_URL}/api/company/profile`, {
      method: "POST",
      headers: jsonCo,
      body: JSON.stringify({ company_id: blendxOpen.company_id }),
    });
    const coDupJson = await coDupRes.json();

    assert(
      compListRes.status === 200 &&
        (compListJson.companies || []).some((c) => c.id === blendxOpen.company_id) &&
        coNoAuthRes.status === 401 &&
        coNotFoundRes.status === 404 &&
        coNotFoundJson.error?.code === "COMPANY_NOT_FOUND" &&
        coJoinRes.status === 201 &&
        coJoinJson.company?.participation === "participating" &&
        coJoinJson.company?.is_demo === true &&
        coDupRes.status === 409 &&
        coDupJson.error?.code === "PROFILE_ALREADY_EXISTS",
      "C00",
      "기업 목록(GET /api/companies) & 기업 회원가입(POST /api/company/profile 401·404·201·409)"
    );

    // --------------------------------------------------------
    // Phase 1. 인증 · A01 · 온보딩 전 가드 (T04~T08)
    // --------------------------------------------------------
    console.log("\n▶ Phase 1. 인증 · 내 역할(A01) · 온보딩 전 가드");
    const t04 = await fetch(`${BASE_URL}/api/me`);
    assert(t04.status === 401, "T04", "미로그인 GET /api/me → 401 UNAUTHORIZED", `${t04.status}`);

    const t05Res = await fetch(`${BASE_URL}/api/me`, { headers: authA });
    const t05Json = await t05Res.json();
    assert(
      t05Res.status === 200 && t05Json.role === null && t05Json.onboarding_complete === false,
      "T05",
      "온보딩 전 GET /api/me → role=null, onboarding_complete=false",
      JSON.stringify(t05Json)
    );

    const t06Res = await fetch(`${BASE_URL}/api/youth/profile`, { headers: authA });
    const t06Json = await t06Res.json();
    assert(
      t06Res.status === 409 && t06Json.error?.code === "ONBOARDING_REQUIRED",
      "T06",
      "온보딩 전 Y02 → 409 ONBOARDING_REQUIRED"
    );

    const t07Res = await fetch(`${BASE_URL}/api/youth/main`, { headers: authA });
    const t07Json = await t07Res.json();
    assert(
      t07Res.status === 409 && t07Json.error?.code === "ONBOARDING_REQUIRED",
      "T07",
      "온보딩 전 Y05 → 409 ONBOARDING_REQUIRED"
    );

    const t08Res = await fetch(`${BASE_URL}/api/applications`, {
      method: "POST",
      headers: jsonA,
      body: JSON.stringify({ job_id: blendxOpen.id }),
    });
    const t08Json = await t08Res.json();
    assert(
      t08Res.status === 409 && t08Json.error?.code === "ONBOARDING_REQUIRED",
      "T08",
      "온보딩 전 Y07 → 409 ONBOARDING_REQUIRED"
    );

    // --------------------------------------------------------
    // Phase 2. 청년 프로필 온보딩 · PII 암호화 · 수정 (T09~T15)
    // --------------------------------------------------------
    console.log("\n▶ Phase 2. 청년 프로필 온보딩 · PII 암호화 · 수정 (Y01~Y03)");
    const t09Res = await fetch(`${BASE_URL}/api/youth/profile`, {
      method: "POST",
      headers: jsonA,
      body: JSON.stringify({
        name: "강서울",
        birth_date: "1997-03-14",
        address: { sido: "서울특별시", sigungu: "마포구" },
        desired_categories: ["marketing_pr"],
        privacy_consent: false,
      }),
    });
    const t09Json = await t09Res.json();
    assert(
      t09Res.status === 400 && t09Json.error?.code === "CONSENT_REQUIRED",
      "T09",
      "Y01 동의 누락 → 400 CONSENT_REQUIRED"
    );

    const t10Res = await fetch(`${BASE_URL}/api/youth/profile`, {
      method: "POST",
      headers: jsonA,
      body: JSON.stringify({
        name: "강서울",
        birth_date: "1997-03-14",
        address: { sido: "서울특별시", sigungu: "마포구" },
        desired_categories: ["marketing_pr", "marketing_pr"],
        privacy_consent: true,
      }),
    });
    const t10Json = await t10Res.json();
    assert(
      t10Res.status === 400 && t10Json.error?.code === "VALIDATION_ERROR",
      "T10",
      "Y01 중복 카테고리 → 400 VALIDATION_ERROR"
    );

    const t11Res = await fetch(`${BASE_URL}/api/youth/profile`, {
      method: "POST",
      headers: jsonCo,
      body: JSON.stringify({
        name: "기업계정",
        birth_date: "1997-03-14",
        address: { sido: "서울특별시", sigungu: "마포구" },
        desired_categories: ["marketing_pr"],
        privacy_consent: true,
      }),
    });
    const t11Json = await t11Res.json();
    assert(
      t11Res.status === 403 && t11Json.error?.code === "ROLE_FORBIDDEN",
      "T11",
      "기업 계정 Y01 호출 → 403 ROLE_FORBIDDEN"
    );

    const t12Res = await fetch(`${BASE_URL}/api/youth/profile`, {
      method: "POST",
      headers: jsonA,
      body: JSON.stringify({
        name: "강서울",
        birth_date: "1997-03-14",
        address: { sido: "서울특별시", sigungu: "마포구" },
        desired_categories: ["marketing_pr"],
        privacy_consent: true,
      }),
    });
    const t12Json = await t12Res.json();
    const { data: rawDbYouthA } = await adminClient
      .from("youth_profiles")
      .select("name_cipher, birth_date_cipher, address_cipher")
      .eq("user_id", youthA.id)
      .single();
    const isEncrypted =
      rawDbYouthA &&
      rawDbYouthA.name_cipher !== "강서울" &&
      rawDbYouthA.birth_date_cipher !== "1997-03-14" &&
      !rawDbYouthA.address_cipher.includes("마포구");
    assert(
      t12Res.status === 201 &&
        t12Json.age === 29 &&
        t12Json.youth_policy?.status === "eligible" &&
        isEncrypted,
      "T12",
      "Y01 정상 온보딩 (201) + DB PII 암호화 저장 확인",
      `age=${t12Json.age}, policy=${t12Json.youth_policy?.status}`
    );

    const t13Res = await fetch(`${BASE_URL}/api/youth/profile`, {
      method: "POST",
      headers: jsonA,
      body: JSON.stringify({
        name: "강서울",
        birth_date: "1997-03-14",
        address: { sido: "서울특별시", sigungu: "마포구" },
        desired_categories: ["marketing_pr"],
        privacy_consent: true,
      }),
    });
    const t13Json = await t13Res.json();
    const t13YouthToCoRes = await fetch(`${BASE_URL}/api/company/profile`, {
      method: "POST",
      headers: jsonA,
      body: JSON.stringify({ company_id: blendxOpen.company_id }),
    });
    const t13YouthToCoJson = await t13YouthToCoRes.json();
    assert(
      t13Res.status === 409 &&
        t13Json.error?.code === "PROFILE_ALREADY_EXISTS" &&
        t13YouthToCoRes.status === 403 &&
        t13YouthToCoJson.error?.code === "ROLE_FORBIDDEN",
      "T13",
      "Y01 중복 온보딩(409) & 청년 계정의 기업 회원가입 차단(403 ROLE_FORBIDDEN)"
    );

    const [t14MeRes, t14ProfRes] = await Promise.all([
      fetch(`${BASE_URL}/api/me`, { headers: authA }),
      fetch(`${BASE_URL}/api/youth/profile`, { headers: authA }),
    ]);
    const t14Me = await t14MeRes.json();
    const t14Prof = await t14ProfRes.json();
    assert(
      t14Me.role === "youth" &&
        t14Me.onboarding_complete === true &&
        t14ProfRes.status === 200 &&
        t14Prof.name === "강서울" &&
        t14Prof.birth_date === "1997-03-14" &&
        t14Prof.address?.sigungu === "마포구",
      "T14",
      "온보딩 후 A01(youth) & Y02(복호화 프로필) 확인"
    );

    const t15EmptyRes = await fetch(`${BASE_URL}/api/youth/profile`, {
      method: "PATCH",
      headers: jsonA,
      body: JSON.stringify({}),
    });
    const t15EmptyJson = await t15EmptyRes.json();
    // Youth C 온보딩 (만 39세, 1987-03-10 -> 4개월 뒤 40세 경계 나이)
    const t15YouthCRes = await fetch(`${BASE_URL}/api/youth/profile`, {
      method: "POST",
      headers: jsonC,
      body: JSON.stringify({
        name: "최윤서",
        birth_date: "1987-03-10",
        address: { sido: "서울특별시", sigungu: "성동구" },
        desired_categories: ["marketing_pr"],
        privacy_consent: true,
      }),
    });
    const t15YouthCJson = await t15YouthCRes.json();
    assert(
      t15EmptyRes.status === 400 &&
        t15EmptyJson.error?.code === "VALIDATION_ERROR" &&
        t15YouthCRes.status === 201 &&
        t15YouthCJson.youth_policy?.status === "needs_check" &&
        t15YouthCJson.youth_policy?.items?.age === "unknown",
      "T15",
      "Y03 빈 수정(400) & Youth C(만 39세 경계 나이) needs_check 확인",
      `YouthC policy=${t15YouthCJson.youth_policy?.status} (age=${t15YouthCJson.youth_policy?.items?.age})`
    );

    // --------------------------------------------------------
    // Phase 3. 이력서 PDF 순차 API · AI 정제 · 매칭 · 캐시 (T16~T21)
    // --------------------------------------------------------
    console.log("\n▶ Phase 3. 이력서 PDF 순차 업로드(415/400/413/200) · 매칭 · 캐시 (Y04~Y06)");
    const t16Res = await fetch(`${BASE_URL}/api/youth/main`, { headers: authA });
    const t16Json = await t16Res.json();
    const firstOpenCard = (t16Json.postings || []).find((p) => !p.is_closed);
    assert(
      t16Res.status === 200 &&
        t16Json.has_resume === false &&
        t16Json.recommended?.length === 0 &&
        firstOpenCard?.match?.status === "no_resume" &&
        firstOpenCard?.match?.score === null &&
        firstOpenCard?.apply_block_reason === "resume_required",
      "T16",
      "이력서 없을 때 Y05 → 추천 0건, no_resume, score=null, 진행중 공고 우선 정렬"
    );

    const t17Res = await fetch(`${BASE_URL}/api/applications`, {
      method: "POST",
      headers: jsonA,
      body: JSON.stringify({ job_id: blendxOpen.id }),
    });
    const t17Json = await t17Res.json();
    assert(
      t17Res.status === 400 && t17Json.error?.code === "RESUME_REQUIRED",
      "T17",
      "이력서 없이 Y07 지원 → 400 RESUME_REQUIRED"
    );

    // T18-1: 415 UNSUPPORTED_FILE_TYPE
    const badTxtForm = new FormData();
    badTxtForm.append("file", new Blob(["not a pdf"], { type: "text/plain" }), "bad.txt");
    const t18BadRes = await fetch(`${BASE_URL}/api/youth/resume`, {
      method: "PUT",
      headers: authA,
      body: badTxtForm,
    });
    const t18BadJson = await t18BadRes.json();

    // T18-2: 400 PDF_TEXT_EMPTY (유효 %PDF- 시그니처지만 텍스트 없는 빈 PDF)
    const emptyPdfBuf = Buffer.from(
      "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 595 842]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF"
    );
    const emptyPdfForm = new FormData();
    emptyPdfForm.append("file", new Blob([emptyPdfBuf], { type: "application/pdf" }), "empty.pdf");
    const t18EmptyRes = await fetch(`${BASE_URL}/api/youth/resume`, {
      method: "PUT",
      headers: authA,
      body: emptyPdfForm,
    });
    const t18EmptyJson = await t18EmptyRes.json();

    // T18-3: 413 FILE_TOO_LARGE (> 5MiB)
    const hugeBuf = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(5 * 1024 * 1024 + 128)]);
    const hugeForm = new FormData();
    hugeForm.append("file", new Blob([hugeBuf], { type: "application/pdf" }), "huge.pdf");
    const t18HugeRes = await fetch(`${BASE_URL}/api/youth/resume`, {
      method: "PUT",
      headers: authA,
      body: hugeForm,
    });
    const t18HugeJson = await t18HugeRes.json();

    assert(
      t18BadRes.status === 415 &&
        t18BadJson.error?.code === "UNSUPPORTED_FILE_TYPE" &&
        t18EmptyRes.status === 400 &&
        t18EmptyJson.error?.code === "PDF_TEXT_EMPTY" &&
        t18HugeRes.status === 413 &&
        t18HugeJson.error?.code === "FILE_TOO_LARGE",
      "T18",
      "Y04 순차 방어 검증 (415 비PDF · 400 빈PDF · 413 5MiB초과)"
    );

    // T19: 실제 시연 PDF 업로드 (Youth A + Youth C)
    const realPdfBuf = fs.readFileSync(PDF_PATH);
    const formA = new FormData();
    formA.append(
      "file",
      new Blob([realPdfBuf], { type: "application/pdf" }),
      "이력서_A_강서울_디지털캠페인AE.pdf"
    );
    const t0Pdf = Date.now();
    const t19Res = await fetch(`${BASE_URL}/api/youth/resume`, {
      method: "PUT",
      headers: authA,
      body: formA,
    });
    const t19Json = await t19Res.json();
    if (t19Json.resume_id) {
      uploadedStoragePaths.push(`${youthA.id}/${t19Json.resume_id}.pdf`);
    }
    assert(
      t19Res.status === 200 &&
        t19Json.extraction_status === "completed" &&
        t19Json.profile_version === 2 &&
        (t19Json.matching_json?.skills || []).length > 0 &&
        t19Json.matching_json?.career?.declared_total_months === 44,
      "T19",
      `Y04 실 PDF 업로드 & OpenAI 정제 (${((Date.now() - t0Pdf) / 1000).toFixed(1)}s)`,
      `v=${t19Json.profile_version}, career=${t19Json.matching_json?.career?.declared_total_months}개월`
    );

    // Youth C도 같은 PDF 업로드 (T25·T28·T30용)
    const formC = new FormData();
    formC.append(
      "file",
      new Blob([realPdfBuf], { type: "application/pdf" }),
      "이력서_C_최윤서.pdf"
    );
    const uploadCRes = await fetch(`${BASE_URL}/api/youth/resume`, {
      method: "PUT",
      headers: authC,
      body: formC,
    });
    const uploadCJson = await uploadCRes.json();
    if (uploadCJson.resume_id) {
      uploadedStoragePaths.push(`${youthC.id}/${uploadCJson.resume_id}.pdf`);
    }

    // T20: Y05 1차(캐시 저장) & 2차(캐시 히트)
    const t20FirstStart = Date.now();
    const t20Res1 = await fetch(`${BASE_URL}/api/youth/main`, { headers: authA });
    const t20Ms1 = Date.now() - t20FirstStart;
    const t20Json1 = await t20Res1.json();

    const { count: cacheCount } = await adminClient
      .from("match_results")
      .select("*", { count: "exact", head: true })
      .eq("youth_user_id", youthA.id);

    const t20SecondStart = Date.now();
    const t20Res2 = await fetch(`${BASE_URL}/api/youth/main`, { headers: authA });
    const t20Ms2 = Date.now() - t20SecondStart;
    const t20Json2 = await t20Res2.json();

    const rec = t20Json1.recommended || [];
    const top1 = rec[0];
    const recIds = new Set(rec.map((r) => r.job_id));
    const nonRecReasonsNull = (t20Json1.postings || [])
      .filter((p) => !recIds.has(p.job_id))
      .every((p) => p.match?.reason === null);
    const hasPersonalInfo =
      Boolean(top1?.match?.reason) &&
      (top1.match.reason.includes("브릿지애드") || top1.match.reason.includes("검색광고마케터"));

    const top1Score = top1?.match?.score ?? 0;
    assert(
      t20Res1.status === 200 &&
        t20Res2.status === 200 &&
        rec.length >= 1 &&
        rec.length <= 3 &&
        rec.every((r) => !r.is_closed) &&
        top1.job_id === blendxOpen.id &&
        top1Score >= 60 &&
        top1.match?.fit_grade === "high" &&
        hasPersonalInfo &&
        nonRecReasonsNull &&
        (cacheCount ?? 0) > 0 &&
        t20Json2.recommended?.[0]?.match?.score === top1Score,
      "T20",
      "Y05 추천 TOP 3 · 개인화 reason · match_results 캐시 저장/히트",
      `1위=${top1Score}점(${top1?.match?.fit_grade}), 캐시=${cacheCount}건, 1차=${t20Ms1}ms → 2차=${t20Ms2}ms`
    );

    // T21: Y06 공고 상세 & 404
    const [t21MissRes, t21OkRes] = await Promise.all([
      fetch(`${BASE_URL}/api/youth/jobs/00000000-0000-4000-8000-000000000000`, { headers: authA }),
      fetch(`${BASE_URL}/api/youth/jobs/${blendxOpen.id}`, { headers: authA }),
    ]);
    const t21MissJson = await t21MissRes.json();
    const t21OkJson = await t21OkRes.json();
    assert(
      t21MissRes.status === 404 &&
        t21MissJson.error?.code === "JOB_NOT_FOUND" &&
        t21OkRes.status === 200 &&
        t21OkJson.match?.score === top1Score &&
        Boolean(t21OkJson.match?.reason) &&
        t21OkJson.can_apply === true,
      "T21",
      "Y06 공고 상세 (200) & 없는 공고 (404 JOB_NOT_FOUND)"
    );

    // --------------------------------------------------------
    // Phase 4. 공고 지원 · 연타 방어 · 캐시 미스 계산 · 스냅샷 불변성 (T22~T26)
    // --------------------------------------------------------
    console.log("\n▶ Phase 4. 공고 지원 · 연타 방어 · 캐시 미스 계산 · 스냅샷 불변성 (Y07, Y08)");
    const t22Res = await fetch(`${BASE_URL}/api/applications`, {
      method: "POST",
      headers: jsonA,
      body: JSON.stringify({ job_id: closedJob.id }),
    });
    const t22Json = await t22Res.json();

    // T22-2: 미참여 기업 공고(열림 상태)는 외부 링크로 이동해야 하며, Y07 내부 지원 시 403 COMPANY_NOT_PARTICIPATING
    const nonPartDetailRes = await fetch(`${BASE_URL}/api/youth/jobs/${otherOpenJob.id}`, {
      headers: authA,
    });
    const nonPartDetail = await nonPartDetailRes.json();
    const nonPartApplyRes = await fetch(`${BASE_URL}/api/applications`, {
      method: "POST",
      headers: jsonA,
      body: JSON.stringify({ job_id: otherOpenJob.id }),
    });
    const nonPartApplyJson = await nonPartApplyRes.json();
    assert(
      t22Res.status === 409 &&
        t22Json.error?.code === "POSTING_CLOSED" &&
        nonPartDetail.company?.participation === "non_participating" &&
        nonPartDetail.can_apply === false &&
        nonPartDetail.apply_block_reason === "company_not_participating" &&
        Boolean(nonPartDetail.external_url && !nonPartDetail.external_url.includes("hrmgDetail.do")) &&
        nonPartApplyRes.status === 403 &&
        nonPartApplyJson.error?.code === "COMPANY_NOT_PARTICIPATING",
      "T22",
      "마감 공고 409 & 미참여 기업 공고(external_url 외부 링크 + Y07 403 차단)",
      `external_url=${nonPartDetail.external_url?.slice(0, 45)}`
    );

    const t23Res = await fetch(`${BASE_URL}/api/applications`, {
      method: "POST",
      headers: jsonA,
      body: JSON.stringify({ job_id: blendxOpen.id }),
    });
    const t23Json = await t23Res.json();
    const t23DetailRes = await fetch(`${BASE_URL}/api/youth/jobs/${blendxOpen.id}`, {
      headers: authA,
    });
    const t23DetailJson = await t23DetailRes.json();
    assert(
      t23Res.status === 201 &&
        Boolean(t23Json.application_id) &&
        t23Json.already_applied === false &&
        t23DetailJson.applied === true &&
        t23DetailJson.can_apply === false &&
        t23DetailJson.apply_block_reason === "already_applied",
      "T23",
      "Y07 정상 지원 (201) & Y06 applied/already_applied 연동",
      `app_id=${t23Json.application_id}`
    );

    // T24: Youth A 재호출(200) + Youth C는 캐시 비운 뒤 동시 2회 연타(T24+T25 동시 검증)
    const t24DupRes = await fetch(`${BASE_URL}/api/applications`, {
      method: "POST",
      headers: jsonA,
      body: JSON.stringify({ job_id: blendxOpen.id }),
    });
    const t24DupJson = await t24DupRes.json();
    const { count: appACount } = await adminClient
      .from("applications")
      .select("*", { count: "exact", head: true })
      .eq("youth_user_id", youthA.id)
      .eq("job_id", blendxOpen.id);

    assert(
      t24DupRes.status === 200 &&
        t24DupJson.application_id === t23Json.application_id &&
        t24DupJson.already_applied === true &&
        appACount === 1,
      "T24",
      "Y07 중복 지원 멱등 응답 (200 already_applied=true) & DB 1건 유지"
    );

    // T25: Youth C가 Y03 PATCH로 캐시 삭제 후, Y05 거치지 않고 바로 Y07 동시 2회 연타 지원
    await fetch(`${BASE_URL}/api/youth/profile`, {
      method: "PATCH",
      headers: jsonC,
      body: JSON.stringify({ desired_categories: ["marketing_pr"] }),
    });
    const [race1Res, race2Res] = await Promise.all([
      fetch(`${BASE_URL}/api/applications`, {
        method: "POST",
        headers: jsonC,
        body: JSON.stringify({ job_id: blendxOpen.id }),
      }),
      fetch(`${BASE_URL}/api/applications`, {
        method: "POST",
        headers: jsonC,
        body: JSON.stringify({ job_id: blendxOpen.id }),
      }),
    ]);
    const [race1Json, race2Json] = await Promise.all([race1Res.json(), race2Res.json()]);
    const { data: appCRow } = await adminClient
      .from("applications")
      .select("id, fit_snapshot, policy_snapshot")
      .eq("youth_user_id", youthC.id)
      .eq("job_id", blendxOpen.id)
      .single();
    const raceStatuses = [race1Res.status, race2Res.status].sort();
    assert(
      raceStatuses[0] === 200 &&
        raceStatuses[1] === 201 &&
        race1Json.application_id === race2Json.application_id &&
        appCRow?.fit_snapshot?.status === "ready" &&
        appCRow?.fit_snapshot?.score === 100 &&
        appCRow?.policy_snapshot?.status === "needs_check",
      "T25",
      "캐시 미스 상태 Y07 동시 연타(201+200) & 실시간 점수 계산(100점) 스냅샷 저장",
      `fit=${appCRow?.fit_snapshot?.score}(${appCRow?.fit_snapshot?.status}), policy=${appCRow?.policy_snapshot?.status}`
    );

    // T26: Youth A가 지원 후 희망직무를 전혀 다른 직무(it_data)로 변경해도 Y08 기존 지원 스냅샷 불변
    await fetch(`${BASE_URL}/api/youth/profile`, {
      method: "PATCH",
      headers: jsonA,
      body: JSON.stringify({ desired_categories: ["it_data"] }),
    });
    const t26Y08Res = await fetch(`${BASE_URL}/api/youth/applications`, { headers: authA });
    const t26Y08Json = await t26Y08Res.json();
    const myApp = (t26Y08Json.applications || []).find(
      (a) => a.application_id === t23Json.application_id
    );
    assert(
      t26Y08Res.status === 200 &&
        myApp?.match_snapshot?.score === top1Score &&
        myApp?.match_snapshot?.profile_version === 2 &&
        myApp?.policy_snapshot?.status === "eligible" &&
        myApp?.resume_url === `/api/applications/${t23Json.application_id}/resume`,
      "T26",
      `프로필 변경(Y03) 후에도 Y08 지원 스냅샷 불변(${top1Score}점·v2) 유지`
    );

    // --------------------------------------------------------
    // Phase 5. 기업 대시보드 · 정책 필터 · 타사 403 차단 (T27~T29)
    // --------------------------------------------------------
    console.log("\n▶ Phase 5. 기업 대시보드 · 지원자 필터 · 타사 공고 403 차단 (C01, C02)");
    const t27Res = await fetch(`${BASE_URL}/api/company/overview`, { headers: authA });
    const t27Json = await t27Res.json();
    assert(
      t27Res.status === 403 && t27Json.error?.code === "ROLE_FORBIDDEN",
      "T27",
      "청년 계정으로 C01 호출 → 403 ROLE_FORBIDDEN"
    );

    const t28OverviewRes = await fetch(`${BASE_URL}/api/company/overview`, { headers: authCo });
    const t28OverviewJson = await t28OverviewRes.json();
    const blendxEntry = (t28OverviewJson.companies || [])[0];
    const aeJobSummary = (blendxEntry?.jobs || []).find((j) => j.job_id === blendxOpen.id);

    const [t28AllRes, t28EligRes, t28NeedsRes, t28BadRes] = await Promise.all([
      fetch(`${BASE_URL}/api/company/jobs/${blendxOpen.id}/applicants?policy=all`, { headers: authCo }),
      fetch(`${BASE_URL}/api/company/jobs/${blendxOpen.id}/applicants?policy=eligible`, {
        headers: authCo,
      }),
      fetch(`${BASE_URL}/api/company/jobs/${blendxOpen.id}/applicants?policy=needs_check`, {
        headers: authCo,
      }),
      fetch(`${BASE_URL}/api/company/jobs/${blendxOpen.id}/applicants?policy=invalid`, {
        headers: authCo,
      }),
    ]);
    const [t28All, t28Elig, t28Needs, t28Bad] = await Promise.all([
      t28AllRes.json(),
      t28EligRes.json(),
      t28NeedsRes.json(),
      t28BadRes.json(),
    ]);

    const countsOk =
      t28All.counts?.all === 2 &&
      t28All.counts?.eligible === 1 &&
      t28All.counts?.needs_check === 1 &&
      t28All.counts?.ineligible === 0 &&
      t28All.counts?.all ===
        t28All.counts?.eligible + t28All.counts?.needs_check + t28All.counts?.ineligible;

    assert(
      t28OverviewRes.status === 200 &&
        typeof blendxEntry?.company?.is_demo === "boolean" &&
        aeJobSummary?.applicant_count === 2 &&
        aeJobSummary?.job_policy?.status === "eligible" &&
        t28AllRes.status === 200 &&
        t28All.job?.job_policy?.status === "eligible" &&
        countsOk &&
        t28Elig.applicants?.length === 1 &&
        t28Elig.applicants?.[0]?.name === "강서울" &&
        t28Needs.applicants?.length === 1 &&
        t28Needs.applicants?.[0]?.name === "최윤서" &&
        t28BadRes.status === 400 &&
        t28Bad.error?.code === "VALIDATION_ERROR",
      "T28",
      "C01/C02 공고 job_policy · 지원자 수 · 정책 필터 합계(2=1+1+0) · 400 검증",
      `job_policy=${aeJobSummary?.job_policy?.status}, counts=${JSON.stringify(t28All.counts)}`
    );

    const t29Res = await fetch(
      `${BASE_URL}/api/company/jobs/${otherJob.id}/applicants?policy=all`,
      { headers: authCo }
    );
    const t29Json = await t29Res.json();
    assert(
      t29Res.status === 403 && t29Json.error?.code === "COMPANY_ACCESS_DENIED",
      "T29",
      "블렌드엑스 계정으로 타사 공고 C02 요청 → 403 COMPANY_ACCESS_DENIED"
    );

    // --------------------------------------------------------
    // Phase 6. 지원 당시 이력서 PDF 스트리밍 권한 검증 (T30)
    // --------------------------------------------------------
    console.log("\n▶ Phase 6. 지원 당시 이력서 PDF 스트리밍 권한 검증 (F01)");
    const appIdA = t23Json.application_id;
    const [f01Self, f01Company, f01Other, f01Missing] = await Promise.all([
      fetch(`${BASE_URL}/api/applications/${appIdA}/resume`, { headers: authA }),
      fetch(`${BASE_URL}/api/applications/${appIdA}/resume`, { headers: authCo }),
      fetch(`${BASE_URL}/api/applications/${appIdA}/resume`, { headers: authC }),
      fetch(`${BASE_URL}/api/applications/00000000-0000-4000-8000-000000000000/resume`, {
        headers: authA,
      }),
    ]);

    const selfSig = Buffer.from(await f01Self.arrayBuffer()).subarray(0, 5).toString("latin1");
    const coSig = Buffer.from(await f01Company.arrayBuffer()).subarray(0, 5).toString("latin1");
    const otherJson = await f01Other.json();
    const missingJson = await f01Missing.json();

    assert(
      f01Self.status === 200 &&
        f01Self.headers.get("content-type")?.includes("application/pdf") &&
        selfSig === "%PDF-" &&
        f01Company.status === 200 &&
        coSig === "%PDF-" &&
        f01Other.status === 403 &&
        otherJson.error?.code === "APPLICATION_ACCESS_DENIED" &&
        f01Missing.status === 404 &&
        missingJson.error?.code === "APPLICATION_NOT_FOUND",
      "T30",
      "F01 PDF 스트리밍 (본인 200 · 소유기업 200 · 타인 403 · 없는ID 404)"
    );
  } finally {
    console.log("\n▶ Cleanup: 테스트 데이터 원상복구");
    if (createdUserIds.length > 0) {
      await adminClient.from("applications").delete().in("youth_user_id", createdUserIds);
    }
    if (blendxCompanyId) {
      await adminClient
        .from("companies")
        .update({
          is_demo: originalBlendxIsDemo,
          participation: originalBlendxIsDemo ? "participating" : "non_participating",
        })
        .eq("id", blendxCompanyId);
    }
    if (uploadedStoragePaths.length > 0) {
      await adminClient.storage.from("resumes").remove(uploadedStoragePaths);
      console.log(`  🧹 Storage PDF 삭제 완료 (${uploadedStoragePaths.length}건)`);
    }
    for (const uid of createdUserIds) {
      await adminClient.auth.admin.deleteUser(uid);
    }
    console.log(`  🧹 임시 테스트 유저 삭제 완료 (${createdUserIds.length}명, CASCADE)`);
  }

  console.log("\n==========================================================");
  console.log(`🎉 전체 13개 API E2E 결과: 통과 ${passed}건 / 실패 ${failed}건`);
  console.log("==========================================================");
  if (failed > 0) process.exit(1);
}

run().catch((e) => {
  console.error("Unhandled E2E error:", e);
  process.exit(1);
});
