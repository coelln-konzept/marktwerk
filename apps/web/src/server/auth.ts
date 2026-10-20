import "server-only";
import { ROLES, type Role } from "@marktwerk/core";
import { account, session, user, verification } from "@marktwerk/db/schema";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";
import { db } from "./db";
import { env } from "./env";

/**
 * Better Auth's access control only governs *user management* endpoints
 * (create user, set role, ban…). Domain permissions live in
 * @marktwerk/core `can()`.
 */
const ac = createAccessControl(defaultStatements);
const noAdminRights = ac.newRole({ user: [], session: [] });
const roles = {
  owner: adminAc,
  manager: noAdminRights,
  staff: noAdminRights,
  field: noAdminRights,
} satisfies Record<Role, unknown>;

export const auth = betterAuth({
  appName: "marktwerk",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
    // No self-signup: the owner creates staff accounts.
    disableSignUp: true,
    minPasswordLength: 10,
  },
  user: {
    additionalFields: {
      locale: { type: "string", defaultValue: "de", input: false },
      phone: { type: "string", required: false, input: false },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  plugins: [
    admin({ ac, roles, defaultRole: "staff", adminRoles: ["owner"] }),
    // must stay last: lets server actions set auth cookies
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
export { ROLES };
