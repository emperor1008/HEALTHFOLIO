import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

/**
 * Get the authenticated user, redirecting to sign-in if not authenticated.
 */
export async function requireAuth() {
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/sign-in");
  }

  return user;
}

/**
 * Get the authenticated user without redirecting.
 * Returns null if not authenticated.
 */
export async function getAuth() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Get the user's profile, creating one if it doesn't exist.
 */
export async function getOrCreateProfile(userId: string) {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (existing) return existing;

  const { data: profile, error } = await admin
    .from("profiles")
    .insert({ id: userId })
    .select()
    .single();

  if (error) throw new Error("Failed to create profile");
  return profile;
}
