import { createServerClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/env";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    SUPABASE_URL,
    SUPABASE_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // chamado de um Server Component: o middleware renova a sessão
          }
        },
      },
    },
  );
}
