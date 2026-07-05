import axios from "axios";
import { supabase } from "@/lib/supabase";

let installed = false;

/**
 * Attaches the current Supabase access token to every outgoing axios request.
 * Registered once at app root (see lib/auth.tsx) so none of the ~40 pages
 * that call the backend via plain `axios.get/post(...)` need to change.
 */
export function installAxiosAuthInterceptor() {
  if (installed) return;
  installed = true;

  axios.interceptors.request.use(async (config) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) {
      config.headers = config.headers ?? {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });
}
