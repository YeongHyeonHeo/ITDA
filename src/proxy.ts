import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
export async function proxy(request: NextRequest) {
  const { url, key } = getSupabasePublicEnv();
  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  await supabase.auth.getClaims();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
// Refresh only authenticated product surfaces. Authorization is checked in each API.
export const config = { matcher: ["/youth/:path*", "/company/:path*", "/api/youth/:path*", "/api/company/:path*", "/api/applications/:path*", "/api/me"] };
