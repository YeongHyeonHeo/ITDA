// scripts/get_test_token.js
// 로컬 curl 테스트용: .env.local을 읽어 테스트 계정을 생성(또는 로그인)하고 access_token만 출력한다.
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const idx = line.indexOf("=");
    if (idx > 0 && !line.trim().startsWith("#")) {
      process.env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const pubKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secKey = process.env.SUPABASE_SECRET_KEY;

const email = process.argv[2] || "local_curl_tester@itda.kr";
const password = process.argv[3] || "LocalTest2026!";

async function main() {
  const auth = createClient(url, pubKey, { auth: { autoRefreshToken: false, persistSession: false } });
  let { data, error } = await auth.auth.signInWithPassword({ email, password });

  if (error) {
    const admin = createClient(url, secKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error && !created.error.message.includes("already")) {
      console.error(created.error.message);
      process.exit(1);
    }
    ({ data, error } = await auth.auth.signInWithPassword({ email, password }));
  }

  if (error || !data?.session?.access_token) {
    console.error(error?.message || "Failed to issue token");
    process.exit(1);
  }
  process.stdout.write(data.session.access_token);
}

main();
