import { supabase } from "@/lib/supabase";

// Plain fetch() isn't covered by the axios auth interceptor (axiosAuthInterceptor.ts),
// so requests made with fetch() need the Supabase bearer token attached manually.
export async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
