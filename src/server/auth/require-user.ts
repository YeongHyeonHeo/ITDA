import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { headers } from "next/headers";

export async function requireUser() {
  // 1. Try Cookie session from @supabase/ssr
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user) {
      return { user: data.user, supabase };
    }
  } catch {
    // Cookie read failed, fallback to header
  }

  // 2. Fallback: Check Authorization: Bearer <token> header (for API / script / curl)
  try {
    const headerStore = await headers();
    const authHeader = headerStore.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7).trim();
      const admin = createAdminClient();
      const { data: userData, error: userError } = await admin.auth.getUser(token);
      if (!userError && userData.user) {
        return { user: userData.user, supabase: admin };
      }
    }
  } catch {
    // Header check failed
  }

  return null;
}
