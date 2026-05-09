# Auth UI + Onboarding — Design Spec

Phase 1 of the Ledgr build order. Unblocks all subsequent phases by providing login, signup, household creation, and default category seeding.

## Scope

- Email/password login and signup pages
- Auto-create household + seed default categories on signup (via Better Auth hook)
- Session validation in middleware (cryptographic, not cookie-presence)
- Self-healing household provisioning for edge cases
- Centered card auth layout with dark mode support (OS-level)
- No OAuth, no password reset, no email verification, no next-themes (all deferred)

## Architecture

### File Structure

```
src/
├── app/
│   ├── (auth)/
│   │   ├── layout.tsx              ← Centered card layout (Server Component)
│   │   ├── login/page.tsx          ← Extracts + sanitizes callbackUrl, renders <LoginForm />
│   │   └── signup/page.tsx         ← Renders <SignupForm />
│   ├── (dashboard)/
│   │   ├── layout.tsx              ← Dashboard shell stub (session + household guard)
│   │   └── page.tsx                ← Dashboard landing (placeholder for Phase 6)
│   └── layout.tsx                  ← Root layout (fonts, metadata)
│
├── components/
│   ├── ui/                         ← shadcn: button, input, label, card
│   └── auth/
│       ├── auth-card.tsx           ← Card wrapper (logo, title, footer link)
│       ├── login-form.tsx          ← "use client" — email/password form
│       └── signup-form.tsx         ← "use client" — name/email/password/confirm form
│
├── lib/
│   ├── auth/
│   │   ├── index.ts                ← Better Auth config + databaseHooks
│   │   ├── client.ts               ← Auth client with explicit baseURL
│   │   └── session.ts              ← getSession() + getHouseholdId() via React.cache()
│   └── url.ts                      ← sanitizeCallbackUrl() helper
│
├── db/seed/
│   └── categories.ts              ← DEFAULT_CATEGORIES data + seedDefaultCategories()
│
tests/integration/
│   └── onboarding.test.ts         ← 5 integration tests
e2e/
    └── auth.spec.ts               ← 1 E2E signup flow test
```

### Layer Responsibilities

- **Pages** — Server Components. Minimal logic (extract + sanitize searchParams). Render form component inside auth layout.
- **Auth components** — Client Components. Own form state via `useState` + `useTransition`. Call Better Auth client methods. Handle errors/loading. Redirect on success via `useRouter().push()`.
- **AuthCard** — Server-safe component. Shared card wrapper: logo, heading, card styling, navigation footer link.
- **Auth hooks (databaseHooks)** — Business logic in `lib/auth/index.ts`. Household + member + settings + categories created in a single DB transaction on user creation.
- **Session helpers** — `getSession()` and `getHouseholdId()` with `React.cache()`. `getHouseholdId()` includes self-healing: if no household found, create one inline.
- **Seed data** — Pure data + insert function. Reusable by signup hook, self-healing path, and future `pnpm db:seed` command.

## Middleware — Session Validation

The existing middleware only checks cookie presence. This is a security hole — an expired or forged cookie would pass through.

**Fix:** Use `auth.api.getSession()` for cryptographic session validation:

```ts
// src/middleware.ts
import { auth } from "@/lib/auth";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}
```

This validates the session signature against the database. SQLite is local (not a remote DB call), so the overhead is acceptable for a self-hosted app.

## Auth Flow

### Login

1. User visits protected route → middleware validates session, redirects to `/login?callbackUrl=/original-path`
2. Page (Server Component) extracts and sanitizes `callbackUrl` (must be relative path starting with `/`, not `//`)
3. LoginForm calls `authClient.signIn.email({ email, password })`
4. On success → `router.push(callbackUrl ?? "/")`
5. On error → inline error message with `aria-describedby` linking to relevant field

### Signup

1. User clicks "Don't have an account?" on login page → navigates to `/signup`
2. SignupForm validates confirm-password matches client-side before submitting
3. SignupForm calls `authClient.signUp.email({ email, password, name })`
4. Better Auth creates user row → `databaseHooks.user.create.after` fires
5. Hook creates household + member + settings + categories in single DB transaction
6. On success → `router.push("/")`
7. On error → inline error message

### callbackUrl Sanitization

```ts
// src/lib/url.ts
export function sanitizeCallbackUrl(url: string | null): string {
  if (!url) return "/";
  if (!url.startsWith("/") || url.startsWith("//")) return "/";
  return url;
}
```

Prevents open redirect attacks via crafted `/login?callbackUrl=https://evil.com`.

## Household Creation

### Primary Path — databaseHooks

Better Auth's `databaseHooks.user.create.after` runs during the signup request lifecycle. The `householdMembers.userId` column has no FK constraint to Better Auth's `user` table in the Drizzle schema (it's `text("user_id").notNull()` with no `.references()`), so there is no FK violation risk even if the hook fires before Better Auth's own transaction commits.

```ts
// In lib/auth/index.ts — databaseHooks.user.create.after
import { v4 as uuid } from "uuid";

await db.transaction(async (tx) => {
  const existing = await tx.select()
    .from(householdMembers)
    .where(eq(householdMembers.userId, user.id))
    .limit(1);
  if (existing.length > 0) return;

  const householdId = uuid();
  await tx.insert(households).values({ id: householdId, name: "My Finances" });
  await tx.insert(householdMembers).values({
    id: uuid(), householdId, userId: user.id, role: "owner",
  });
  await tx.insert(userSettings).values({ id: uuid(), userId: user.id });
  await seedDefaultCategories(tx, householdId);
});
```

### Recovery Path — Self-Healing in getHouseholdId()

The `databaseHooks` approach has a known limitation: if the hook throws, Better Auth swallows the error silently — the signup returns 200 but no household exists. There is no retry on login (login does not trigger `user.create.after`). The user is permanently orphaned.

**Fix:** `getHouseholdId()` detects missing households and provisions inline:

```ts
// src/lib/auth/session.ts
export const getHouseholdId = cache(async (): Promise<string> => {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");

  const member = await db.query.householdMembers.findFirst({
    where: eq(householdMembers.userId, session.user.id),
  });

  if (member) return member.householdId;

  // Self-heal: hook failed during signup — provision now
  return provisionHousehold(session.user.id);
});
```

`provisionHousehold()` is the same logic as the databaseHooks handler, extracted into a shared function. It includes the idempotency guard, so concurrent calls are safe. This means `getHouseholdId()` is zero-arg — callers don't need to resolve userId first.

### ID Generation

Use `uuid` v4 via the already-installed `uuid` package (`import { v4 as uuid } from "uuid"`). Better Auth generates its own IDs (nanoid-format) for the user table — the format mismatch is acceptable since these are opaque identifiers with no cross-system comparison.

## HouseholdId Resolution

```ts
// src/lib/auth/session.ts
import { cache } from "react";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

export const getHouseholdId = cache(async (): Promise<string> => {
  // Zero-arg: resolves session internally, includes self-healing
  // See "Recovery Path" section above for implementation
});
```

`React.cache()` deduplicates within a single request. Multiple server components calling `getHouseholdId()` in the same render trigger only one DB query.

## Database Migration Strategy

Better Auth auto-creates its own tables (`user`, `session`, `account`, `verification`) via its internal migration on first startup. These tables are NOT in the Drizzle schema directory.

**Strategy:**
1. Run `pnpm dlx better-auth migrate` first — creates Better Auth's tables in the SQLite DB
2. Run `pnpm db:migrate` second — Drizzle creates application tables (households, categories, etc.)
3. Document this order in the README and `pnpm db:setup` script

Drizzle's `push` / `migrate` ignores tables it doesn't know about, so the two systems coexist without conflict. Better Auth's tables are managed by Better Auth; application tables are managed by Drizzle.

Add to `package.json`:
```json
"db:setup": "pnpm dlx better-auth migrate && pnpm db:migrate"
```

## shadcn/ui Setup

### CSS Variables

The current `globals.css` only defines `--background` and `--foreground`. shadcn/ui v4 components require the full semantic CSS variable set (`--muted`, `--card`, `--border`, `--input`, `--ring`, `--primary`, `--destructive`, etc.).

**Fix:** Run `pnpm dlx shadcn@latest init` before adding components. This generates the complete CSS variable set for both light and dark themes. The existing `globals.css` content will be replaced/merged.

### Primitives

Install exactly 4 components after init:

```bash
pnpm dlx shadcn@latest add button input label card
```

## UI Components

### Form Pattern

Both forms use `useState` + `useTransition` with Better Auth client methods:

```tsx
const [error, setError] = useState<string | null>(null);
const [pending, startTransition] = useTransition();

function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault();
  setError(null);
  startTransition(async () => {
    const { error } = await authClient.signIn.email({ email, password });
    if (error) {
      setError(AUTH_ERRORS[error.code] ?? "Something went wrong.");
      return;
    }
    router.push(callbackUrl);
  });
}
```

### Signup Form Fields

| Field | Type | Validation |
|-------|------|-----------|
| Name | text | Required |
| Email | email | Required, HTML email validation |
| Password | password | Required, min 8 chars (Better Auth default) |
| Confirm Password | password | Required, must match password (client-side) |

Confirm password is required because password reset is deferred — a typo during signup would lock the user out permanently.

Show a hint below the password field: "Must be at least 8 characters."

### Error Display & Accessibility

- Error container: `<p id="form-error" role="alert" className="text-sm text-destructive">` below the submit button
- All inputs have `<Label htmlFor="...">` associations
- Error inputs get `aria-describedby="form-error"` when an error is present
- Submit button shows "Signing in..." / "Creating account..." text during `pending` state and is disabled

Map Better Auth error codes to human strings:

| Error Code | Message |
|------------|---------|
| `INVALID_EMAIL_OR_PASSWORD` | "Invalid email or password." |
| `USER_ALREADY_EXISTS` | "An account with this email already exists." |
| (default) | "Something went wrong. Please try again." |

### Auth Layout

`src/app/(auth)/layout.tsx` — Server Component:

```tsx
<div className="min-h-screen flex items-center justify-center bg-muted/40">
  {children}
</div>
```

### AuthCard

Server-safe wrapper component accepting `title`, `description`, and `footer` props:

```tsx
<Card className="w-full max-w-sm">
  <CardHeader className="text-center">
    <h1 className="text-2xl font-bold mb-2">Ledgr</h1>
    <CardTitle>{title}</CardTitle>
    <CardDescription>{description}</CardDescription>
  </CardHeader>
  <CardContent>{children}</CardContent>
  <CardFooter className="justify-center text-sm text-muted-foreground">
    {footer}
  </CardFooter>
</Card>
```

### Dashboard Layout & Landing

`src/app/(dashboard)/layout.tsx` — minimal wrapper. No nav or sidebar yet (Phase 4). Exists as a structural boundary for future dashboard chrome.

`src/app/(dashboard)/page.tsx` — placeholder dashboard landing. Shows a welcome message with the household name. This is where authenticated users land after login/signup. The root `page.tsx` at `/` redirects authenticated users here.

**Root page.tsx update:** Redirect authenticated users to `/dashboard`, show marketing/landing page for unauthenticated users (or just redirect to `/login` for Phase 1).

## Auth Client Configuration

```ts
// src/lib/auth/client.ts
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
});
```

Add `NEXT_PUBLIC_APP_URL=http://localhost:3000` to `.env.example` with a comment that it must be set to the public URL in production Docker deployments.

## Default Categories

`src/db/seed/categories.ts` exports:

1. `DEFAULT_CATEGORIES` — static data array of category groups + categories
2. `seedDefaultCategories(db, householdId)` — inserts all rows, marks `is_system = true`
3. `provisionHousehold(userId, db?)` — shared function used by both databaseHooks and self-healing path

Category groups (8):

| Group | Categories |
|-------|-----------|
| Income | Salary, Freelance, Investment Income, Other Income |
| Housing | Rent/Mortgage, Property Tax, Home Insurance, Maintenance |
| Food & Dining | Groceries, Restaurants, Coffee Shops |
| Transportation | Gas, Public Transit, Car Payment, Car Insurance, Parking |
| Utilities | Electric, Water, Internet, Phone |
| Shopping | Clothing, Electronics, Home Goods |
| Health | Health Insurance, Medical, Pharmacy, Fitness |
| Personal | Entertainment, Subscriptions, Education, Gifts, Travel |

All seeded categories have `is_system = true` and `is_income = true` for the Income group categories.

## Root Layout Updates

Update `src/app/layout.tsx`:

- Change metadata title to "Ledgr" and description to "Self-hosted personal finance"
- Keep Geist + Geist_Mono fonts
- Keep existing body classes

## Dark Mode

Deferred. The existing `prefers-color-scheme` media query in `globals.css` provides OS-level dark mode without JavaScript. `next-themes` (manual toggle) will be added when the dashboard settings page is built. The shadcn init will set up proper dark mode CSS variables for both themes.

## Testing

### Integration Tests (`tests/integration/onboarding.test.ts`)

5 tests using `createTestDb()`:

1. **Happy path** — `provisionHousehold(userId, testDb)` inserts household, member (role="owner"), user_settings, and all default category_groups + categories with correct `household_id`, `is_system = true`, Income categories with `is_income = true`
2. **Atomicity** — force a constraint violation mid-transaction, assert zero `households`, `household_members`, `category_groups` rows exist afterward
3. **Idempotency** — calling `provisionHousehold` twice for the same userId does not create a duplicate household
4. **Isolation** — categories seeded for household A are not visible via `scopedQuery(householdB_id)`
5. **Self-healing** — simulate the databaseHooks failure case: create a user without a household, call `getHouseholdId()`, verify household is provisioned

The `provisionHousehold` and `seedDefaultCategories` functions accept a `db` parameter for testability (same pattern as `scopedQuery`).

### E2E Test (`e2e/auth.spec.ts`)

1 test: signup with valid credentials → verify redirect to dashboard → confirm page contains authenticated-only element (e.g., "Welcome" or household name).

No MSW handlers for Better Auth — it runs as a local API route, not an external service.

### Mutation Testing

Key mutant targets:
- Transaction boundary removal — atomicity test must catch
- `role: "owner"` string literal mutation — happy path must assert role explicitly
- `is_system = true` flag — seed test must assert explicitly
- Idempotency guard removal — idempotency test must catch

## Decisions Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Session validation | `auth.api.getSession()` in middleware | Cryptographic validation, not cookie-presence |
| Household creation | databaseHooks + self-healing fallback | Prevents orphaned users; recovers from hook failure |
| Category seeding | Same DB transaction as household | No window of empty state |
| HouseholdId resolution | Zero-arg `getHouseholdId()` with `React.cache()` | One DB hit per request, self-healing built in |
| Form handling | `useState` + `useTransition` | No react-hook-form overhead for 2 simple forms |
| Confirm password | Yes, on signup | No password reset = locked out on typo |
| callbackUrl | Sanitize to relative paths only | Prevents open redirect |
| Dark mode | Defer next-themes | OS `prefers-color-scheme` already works |
| shadcn setup | Run `shadcn init` for full CSS vars | Components need semantic variables |
| shadcn components | button, input, label, card | Minimum needed for auth forms |
| Auth features | Email/password only | Ship fast, add OAuth/password reset later |
| ID generation | `uuid` v4 (already installed) | No new dependency |
| DB migration | Better Auth migrate → Drizzle migrate | Two systems coexist, each owns its tables |
| Testing | 5 integration + 1 E2E | Covers happy path, atomicity, idempotency, isolation, self-healing |
| Accessibility | Labels, aria-describedby, role="alert" | Keyboard + screen reader usable |
