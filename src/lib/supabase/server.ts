import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabasePublicEnv } from "./env";
export async function createClient() {
  const store = await cookies();
  const { url, key } = getSupabasePublicEnv();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(values) {
        // Server Components cannot write cookies; proxy handles refresh there.
        try { values.forEach(({ name, value, options }) => store.set(name, value, options)); }
        catch { /* Read-only Server Component context. */ }
      },
    },
  });
}
