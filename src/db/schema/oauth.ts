import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const oauthClients = sqliteTable("oauth_clients", {
  id: text("id").primaryKey(),
  clientId: text("client_id").unique().notNull(),
  clientName: text("client_name"),
  redirectUris: text("redirect_uris").notNull(),
  createdAt: text("created_at").notNull(),
});

export const oauthCodes = sqliteTable("oauth_codes", {
  code: text("code").primaryKey(),
  clientId: text("client_id").notNull(),
  userId: text("user_id").notNull(),
  householdId: text("household_id").notNull(),
  scope: text("scope").notNull(),
  codeChallenge: text("code_challenge").notNull(),
  codeChallengeMethod: text("code_challenge_method").notNull().default("S256"),
  redirectUri: text("redirect_uri").notNull(),
  expiresAt: text("expires_at").notNull(),
  used: integer("used").notNull().default(0),
});

export const oauthRefreshTokens = sqliteTable("oauth_refresh_tokens", {
  token: text("token").primaryKey(),
  clientId: text("client_id").notNull(),
  userId: text("user_id").notNull(),
  householdId: text("household_id").notNull(),
  scope: text("scope").notNull(),
  expiresAt: text("expires_at").notNull(),
  revoked: integer("revoked").notNull().default(0),
});

export const oauthConsents = sqliteTable("oauth_consents", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  clientId: text("client_id").notNull(),
  scope: text("scope").notNull(),
  grantedAt: text("granted_at").notNull(),
});
