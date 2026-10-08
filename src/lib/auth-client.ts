"use client";

/**
 * Better Auth browser client. The ONLY auth surface used by client components:
 * no Supabase auth, no role assertion, no tokens in browser storage. Sessions
 * live in HTTP-only cookies managed entirely by the server.
 */
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;
