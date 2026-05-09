# Auth UI + Onboarding — Design Spec

Phase 1 of the Ledgr build order. Unblocks all subsequent phases by providing login, signup, household creation, and default category seeding.

## Scope

- Email/password login and signup pages
- Auto-create household + seed default categories on signup (via Better Auth hook)
- Session-aware householdId resolution for server components
- Centered card auth layout with dark mode support (OS-level)
- No OAuth, no password reset, no email verification, no next-themes (all deferred)

## Architecture

### File Structure

```
src/
├── app/
│   ├── (auth)/
│   │   ├── layout.tsx              ← Centered card layout (Server Component)
│   │   ├── login/page.tsx          ← Extracts callbackUrl, renders <LoginForm />
│   │   └── signup/page.tsx         ← Renders <SignupForm />
│   ├── (dashboard)/
│   │   └── layout.tsx              ← Dashboard shell stub (renders children)
│   └── layout.tsx                  ← Root layout (fonts, metadata)
│
├── components/
│   ├── ui/                         ← shadcn: button, input, label, card
│   └── auth/
│       ├── auth-card.tsx           ← Card wrapper (logo, title, footer link)
│       ├── login-form.tsx          ← "use client" — email/password form
│       └── signup-form.tsx         ← "use client" — name/email/password form
│
├── lib/auth/
│   ├── index.ts                    ← Better Auth config + databaseHooks
│   ├── client.ts                   ← Auth client with explicit baseURL
│   └── session.ts                  ← getSession() + getHouseholdId() via React.cache()
│
├── db/seed/
│   └── categories.ts              ← DEFAULT_CATEGORIES data + seedDefaultCategories()
│
tests/integration/
│   └── onboarding.test.ts         ← 4 integration tests
e2e/
    └── auth.spec.ts               ← 1 E2E signup flow test
```

### Layer Responsibilities

- **Pages** — Server Components. Zero logic. Extract searchParams (callbackUrl), render form component inside auth layout.
- **Auth components** — Client Components. Own form state via `useState` + `useTransition`. Call Better Auth client methods. Handle errors/loading. Redirect on success via `useRouter().push()`.
- **AuthCard** — Server-safe component. Shared card wrapper: logo, heading, card styling, navigation footer link ("Already have an account?" / "Don't have an account?").
- **Auth hooks (databaseHooks)** — Business logic in `lib/auth/index.ts`. Household + member + settings + categories created in a single DB transaction on user creation.
- **Seed data** — Pure data + insert function. Reusable by signup hook and future `pnpm db:seed` command. Accepts optional `db` parameter for testability.

## Auth Flow

### Login

1. User visits protected route → middleware redirects to `/login?callbackUrl=/original-path`
2. Page (Server Component) extracts `callbackUrl` from searchParams, passes as prop to `<LoginForm />`
3. LoginForm calls `authClient.signIn.email({ email, password })`
4. On success → `router.push(callbackUrl ?? "/")`
5. On error → inline error message below submit button

### Signup

1. User clicks "Don't have an account?" on login page → navigates to `/signup`
2. SignupForm calls `authClient.signUp.email({ email, password, name })`
3. Better Auth creates user row → `databaseHooks.user.create.after` fires automatically
4. Hook creates household + member + settings + categories in single DB transaction
5. On success → `router.push("/")`
6. On error → inline error message

### Why databaseHooks, Not a Server Action

A client-side server action called after signup has a race window: if the tab closes or network fails between `signUp.email()` succeeding and the action call, the user is left with an account but no household. Every subsequent request breaks. The `databaseHooks.user.create.after` hook runs synchronously inside the signup flow, eliminating this window.

Better Auth commits its own user row before calling the hook, so the hook includes an idempotency guard — check for existing `household_members` row before inserting.

## Household Creation

```ts
// In lib/auth/index.ts — databaseHooks.user.create.after
await db.transaction(async (tx) => {
  // 1. Check idempotency — skip if household already exists for this user
  const existing = await tx.query.householdMembers.findFirst({
    where: eq(householdMembers.userId, user.id),
  });
  if (existing) return;

  // 2. Create household
  const householdId = createId();
  await tx.insert(households).values({ id: householdId, name: "My Finances" });

  // 3. Create member with owner role
  await tx.insert(householdMembers).values({
    id: createId(), householdId, userId: user.id, role: "owner",
  });

  // 4. Create user settings
  await tx.insert(userSettings).values({ id: createId(), userId: user.id });

  // 5. Seed default categories
  await seedDefaultCategories(tx, householdId);
});
```

All steps in a single SQLite transaction — if any step fails, the entire operation rolls back. The user row (created by Better Auth) persists, and the hook will retry on next login attempt.

## HouseholdId Resolution

Middleware stays fast — cookie-presence check only, no DB calls. Server components that need `householdId` use cached helpers:

```ts
// src/lib/auth/session.ts
import { cache } from "react";

export const getSession = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return session;
});

export const getHouseholdId = cache(async (userId: string) => {
  const member = await db.query.householdMembers.findFirst({
    where: eq(householdMembers.userId, userId),
  });
  return member?.householdId ?? null;
});
```

`React.cache()` deduplicates within a single request — multiple server components calling `getHouseholdId()` in the same render only hit the DB once.

## UI Components

### shadcn/ui Primitives

Install exactly 4 components:

```bash
pnpm dlx shadcn@latest add button input label card
```

No react-hook-form, no zod validation library. Two forms with 2-3 fields each don't justify the abstraction.

### Form Pattern

Both forms use `useState` + `useTransition` with Better Auth client methods directly:

```tsx
const [error, setError] = useState<string | null>(null);
const [pending, startTransition] = useTransition();

function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  setError(null);
  startTransition(async () => {
    const { error } = await authClient.signIn.email({ email, password });
    if (error) {
      setError(AUTH_ERRORS[error.code] ?? "Something went wrong.");
      return;
    }
    router.push(callbackUrl ?? "/");
  });
}
```

### Error Display

Single `<p role="alert">` below submit button, conditionally rendered. Map Better Auth error codes to human strings in a local `AUTH_ERRORS` record:

- `INVALID_EMAIL_OR_PASSWORD` → "Invalid email or password."
- `USER_ALREADY_EXISTS` → "An account with this email already exists."

Clear error on every new submission attempt.

### Auth Layout

`src/app/(auth)/layout.tsx` — Server Component:

```tsx
<div className="min-h-screen flex items-center justify-center bg-muted/40">
  {children}
</div>
```

### AuthCard

Server-safe wrapper component:

```tsx
<Card className="w-full max-w-sm">
  <CardHeader className="text-center">
    <h1>Ledgr</h1>
    <CardTitle>{title}</CardTitle>
    <CardDescription>{description}</CardDescription>
  </CardHeader>
  <CardContent>{children}</CardContent>
  <CardFooter className="justify-center">
    {footer}
  </CardFooter>
</Card>
```

### Dashboard Layout Stub

`src/app/(dashboard)/layout.tsx` — minimal wrapper that renders children. No nav or sidebar yet (Phase 4 deliverable). Middleware already handles auth redirection, so this layout has no auth logic — it exists as a structural boundary for future dashboard chrome.

## Auth Client Configuration

Add explicit `baseURL` to prevent proxy issues in production:

```ts
// src/lib/auth/client.ts
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
});
```

## Default Categories

`src/db/seed/categories.ts` exports:

1. `DEFAULT_CATEGORIES` — static data array of category groups + categories
2. `seedDefaultCategories(db, householdId)` — inserts all rows, marks `is_system = true`

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

Deferred. The existing `prefers-color-scheme` media query in `globals.css` provides OS-level dark mode without JavaScript. `next-themes` (manual toggle) will be added when the dashboard settings page is built.

## Testing

### Integration Tests (`tests/integration/onboarding.test.ts`)

4 tests using `createTestDb()`:

1. **Happy path** — `seedDefaultCategories(tx, householdId)` inserts correct number of `category_groups` and `categories` rows, all with matching `household_id`, all with `is_system = true`, Income categories with `is_income = true`
2. **Atomicity** — force a constraint violation mid-transaction, assert zero `households`, `household_members`, `category_groups` rows exist afterward
3. **Idempotency** — calling the household creation logic twice for the same userId does not create a duplicate household (caught by `uq_household_user` unique index or idempotency guard)
4. **Isolation** — categories seeded for household A are not visible via `scopedQuery(householdB_id)`

The `seedDefaultCategories` function accepts a `db` / transaction parameter for testability (same pattern as `scopedQuery`).

### E2E Test (`e2e/auth.spec.ts`)

1 test: signup with valid credentials → verify redirect to dashboard → confirm page contains authenticated-only element.

No MSW handlers for Better Auth — it runs as a local API route, not an external service.

### Mutation Testing

Key mutant targets:
- Transaction boundary removal — atomicity test must catch
- `role: "owner"` string literal mutation — happy path must assert role explicitly
- `is_system = true` flag — seed test must assert explicitly

## Decisions Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Household creation | Better Auth `databaseHooks` | Prevents orphaned users from race condition |
| Category seeding | Same DB transaction | No window of empty state |
| HouseholdId resolution | `React.cache()` helper | One DB hit per request, zero middleware changes |
| Form handling | `useState` + `useTransition` | No react-hook-form overhead for 2 simple forms |
| Dark mode | Defer next-themes | OS `prefers-color-scheme` already works |
| shadcn components | button, input, label, card | Minimum needed for auth forms |
| Auth features | Email/password only | Ship fast, add OAuth/password reset later |
| Testing | 4 integration + 1 E2E | Test business logic, not UI wiring |
| Auth client baseURL | Explicit `NEXT_PUBLIC_APP_URL` | Prevents reverse proxy issues in production |
