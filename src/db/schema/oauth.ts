import { pgTable, text, boolean, uniqueIndex } from "drizzle-orm/pg-core";

export const oauthClients = pgTable("oauth_clients", {
  id: text("id").primaryKey(),
  clientId: text("client_id").unique().notNull(),
  clientName: text("client_name"),
  redirectUris: text("redirect_uris").notNull(),
  createdAt: text("created_at").notNull(),
});

export const oauthCodes = pgTable("oauth_codes", {
  code: text("code").primaryKey(),
  clientId: text("client_id").notNull(),
  userId: text("user_id").notNull(),
  householdId: text("household_id").notNull(),
  scope: text("scope").notNull(),
  codeChallenge: text("code_challenge").notNull(),
  codeChallengeMethod: text("code_challenge_method").notNull().default("S256"),
  redirectUri: text("redirect_uri").notNull(),
  expiresAt: text("expires_at").notNull(),
  used: boolean("used").notNull().default(false),
});

export const oauthRefreshTokens = pgTable("oauth_refresh_tokens", {
  token: text("token").primaryKey(),
  clientId: text("client_id").notNull(),
  userId: text("user_id").notNull(),
  householdId: text("household_id").notNull(),
  scope: text("scope").notNull(),
  expiresAt: text("expires_at").notNull(),
  revoked: boolean("revoked").notNull().default(false),
});

export const oauthConsents = pgTable(
  "oauth_consents",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    clientId: text("client_id").notNull(),
    scope: text("scope").notNull(),
    grantedAt: text("granted_at").notNull(),
  },
  (table) => [uniqueIndex("uq_consent_user_client").on(table.userId, table.clientId)],
);
