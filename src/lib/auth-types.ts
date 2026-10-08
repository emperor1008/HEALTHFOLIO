/**
 * Narrow structural type for the parts of the Better Auth instance the
 * platform uses (better-auth 1.7.x does not export an instance type; the
 * shape below mirrors what `auth.api.getSession` actually returns with this
 * configuration — including the `dob/gender/region` additionalFields).
 */
export type BetterAuthInstance = {
  /** Raw Better Auth request handler — used by better-auth/next-js. */
  handler: (request: Request) => Promise<Response>;
  api: {
    getSession(input: {
      headers: Headers;
    }): Promise<
      | {
          user: {
            id: string;
            email: string;
            name: string;
            image?: string | null;
            emailVerified: boolean;
            createdAt: Date;
            updatedAt: Date;
            dob?: string | null;
            gender?: string | null;
            region?: string | null;
          };
          session: {
            id: string;
            userId: string;
            token: string;
            expiresAt: Date;
          };
        }
      | null
    >;
  };
};
