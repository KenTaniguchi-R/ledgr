import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { passkey } from "@better-auth/passkey";
import { db } from "@/db";
import { provisionHousehold } from "./provision";

/**
 * WebAuthn relying-party ID — the registrable domain passkeys are bound to.
 * Derived from the app URL (hostname only), defaulting to "localhost" for dev.
 */
function passkeyRpID(): string {
  const url = process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (!url) return "localhost";
  try {
    return new URL(url).hostname;
  } catch {
    return "localhost";
  }
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  plugins: [
    passkey({
      rpID: passkeyRpID(),
      rpName: "Ledgr",
    }),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          try {
            await provisionHousehold(user.id);
          } catch {
            console.error(`Failed to provision household for user ${user.id}`);
          }
        },
      },
    },
  },
});
