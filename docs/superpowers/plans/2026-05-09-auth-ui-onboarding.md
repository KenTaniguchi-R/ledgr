# Auth UI + Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build login, signup, household auto-creation, and default category seeding — making the app usable for the first time.

**Architecture:** Thin Server Component pages render Client Component forms that call Better Auth client methods. A `databaseHooks.user.create.after` hook auto-provisions a household + default categories in a single DB transaction on signup. A self-healing `getHouseholdId()` recovers from hook failures. Middleware validates sessions cryptographically.

**Tech Stack:** Next.js 16 (App Router), Better Auth 1.6.10, Drizzle ORM 0.45 + SQLite, shadcn/ui v4, Tailwind v4, Vitest, Playwright

**Spec:** `docs/superpowers/specs/2026-05-09-auth-ui-onboarding-design.md`

---

### Task 1: Initialize shadcn/ui and Install Components

**Files:**
- Modify: `src/app/globals.css`
- Create: `components.json`
- Create: `src/lib/utils.ts` (shadcn utility — `cn()` helper)
- Create: `src/components/ui/button.tsx`
- Create: `src/components/ui/input.tsx`
- Create: `src/components/ui/label.tsx`
- Create: `src/components/ui/card.tsx`

- [ ] **Step 1: Run shadcn init**

```bash
pnpm dlx shadcn@latest init -d
```

This creates `components.json`, `src/lib/utils.ts`, and updates `globals.css` with the full CSS variable set (light + dark themes). The `-d` flag uses defaults (New York style, neutral color, CSS variables).

If prompted for framework, select "Next.js". If prompted for style, select "New York". If prompted for base color, select "Neutral".

Verify `components.json` exists and `globals.css` has been updated with CSS variables like `--primary`, `--muted`, `--card`, `--border`, etc.

- [ ] **Step 2: Install shadcn components**

```bash
pnpm dlx shadcn@latest add button input label card
```

Verify files created:
```bash
ls src/components/ui/button.tsx src/components/ui/input.tsx src/components/ui/label.tsx src/components/ui/card.tsx
```

- [ ] **Step 3: Customize globals.css for Ledgr aesthetic**

After shadcn init generates the CSS variables, customize the palette for a warm-slate financial aesthetic. Edit `src/app/globals.css` — find the `:root` block and update these specific variables (keep the rest as shadcn generated them):

```css
:root {
  /* Override these specific values for warm-slate Ledgr palette */
  --background: oklch(0.985 0.002 75);
  --foreground: oklch(0.145 0.005 75);
  --muted: oklch(0.955 0.005 75);
  --muted-foreground: oklch(0.475 0.008 75);
  --primary: oklch(0.205 0.01 75);
  --primary-foreground: oklch(0.985 0.002 75);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0.005 75);
}

.dark {
  --background: oklch(0.1 0.005 75);
  --foreground: oklch(0.94 0.005 75);
  --muted: oklch(0.175 0.005 75);
  --muted-foreground: oklch(0.55 0.01 75);
  --primary: oklch(0.92 0.005 75);
  --primary-foreground: oklch(0.1 0.005 75);
  --card: oklch(0.13 0.005 75);
  --card-foreground: oklch(0.94 0.005 75);
}
```

Note: If shadcn init uses `@media (prefers-color-scheme: dark)` instead of `.dark` class, keep that selector — it matches our OS-level dark mode approach. The key is overriding the color values, not changing the selector mechanism.

- [ ] **Step 4: Verify the dev server starts**

```bash
pnpm dev
```

Expected: dev server starts without errors. Visit `http://localhost:3000` — should see the existing "Ledgr" heading, now with the shadcn CSS variables applied.

- [ ] **Step 5: Commit**

```bash
git add components.json src/lib/utils.ts src/components/ui/ src/app/globals.css
git commit -m "chore: init shadcn/ui with button, input, label, card components"
```

---

### Task 2: URL Sanitization Helper

**Files:**
- Create: `src/lib/url.ts`
- Create: `src/lib/url.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/url.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { sanitizeCallbackUrl } from "./url";

describe("sanitizeCallbackUrl", () => {
  it("returns the URL for valid relative paths", () => {
    expect(sanitizeCallbackUrl("/dashboard")).toBe("/dashboard");
    expect(sanitizeCallbackUrl("/transactions?page=2")).toBe("/transactions?page=2");
  });

  it("returns / for null or empty input", () => {
    expect(sanitizeCallbackUrl(null)).toBe("/");
    expect(sanitizeCallbackUrl("")).toBe("/");
  });

  it("rejects absolute URLs (open redirect)", () => {
    expect(sanitizeCallbackUrl("https://evil.com")).toBe("/");
    expect(sanitizeCallbackUrl("http://evil.com")).toBe("/");
  });

  it("rejects protocol-relative URLs", () => {
    expect(sanitizeCallbackUrl("//evil.com")).toBe("/");
  });

  it("returns / for paths not starting with /", () => {
    expect(sanitizeCallbackUrl("dashboard")).toBe("/");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run src/lib/url.test.ts
```

Expected: FAIL — `sanitizeCallbackUrl` is not defined.

- [ ] **Step 3: Implement sanitizeCallbackUrl**

Create `src/lib/url.ts`:

```ts
export function sanitizeCallbackUrl(url: string | null): string {
  if (!url || !url.startsWith("/") || url.startsWith("//")) {
    return "/";
  }
  return url;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run src/lib/url.test.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/url.ts src/lib/url.test.ts
git commit -m "feat: add callbackUrl sanitization to prevent open redirect"
```

---

### Task 3: Default Category Seed Data

**Files:**
- Create: `src/db/seed/categories.ts`

- [ ] **Step 1: Create the seed data and insert function**

Create `src/db/seed/categories.ts`:

```ts
import { v4 as uuid } from "uuid";
import { categoryGroups, categories } from "@/db/schema";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";

type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

interface CategoryDef {
  name: string;
  icon: string | null;
  isIncome: boolean;
}

interface GroupDef {
  name: string;
  icon: string | null;
  categories: CategoryDef[];
}

export const DEFAULT_CATEGORIES: GroupDef[] = [
  {
    name: "Income",
    icon: "dollar-sign",
    categories: [
      { name: "Salary", icon: null, isIncome: true },
      { name: "Freelance", icon: null, isIncome: true },
      { name: "Investment Income", icon: null, isIncome: true },
      { name: "Other Income", icon: null, isIncome: true },
    ],
  },
  {
    name: "Housing",
    icon: "home",
    categories: [
      { name: "Rent/Mortgage", icon: null, isIncome: false },
      { name: "Property Tax", icon: null, isIncome: false },
      { name: "Home Insurance", icon: null, isIncome: false },
      { name: "Maintenance", icon: null, isIncome: false },
    ],
  },
  {
    name: "Food & Dining",
    icon: "utensils",
    categories: [
      { name: "Groceries", icon: null, isIncome: false },
      { name: "Restaurants", icon: null, isIncome: false },
      { name: "Coffee Shops", icon: null, isIncome: false },
    ],
  },
  {
    name: "Transportation",
    icon: "car",
    categories: [
      { name: "Gas", icon: null, isIncome: false },
      { name: "Public Transit", icon: null, isIncome: false },
      { name: "Car Payment", icon: null, isIncome: false },
      { name: "Car Insurance", icon: null, isIncome: false },
      { name: "Parking", icon: null, isIncome: false },
    ],
  },
  {
    name: "Utilities",
    icon: "zap",
    categories: [
      { name: "Electric", icon: null, isIncome: false },
      { name: "Water", icon: null, isIncome: false },
      { name: "Internet", icon: null, isIncome: false },
      { name: "Phone", icon: null, isIncome: false },
    ],
  },
  {
    name: "Shopping",
    icon: "shopping-bag",
    categories: [
      { name: "Clothing", icon: null, isIncome: false },
      { name: "Electronics", icon: null, isIncome: false },
      { name: "Home Goods", icon: null, isIncome: false },
    ],
  },
  {
    name: "Health",
    icon: "heart",
    categories: [
      { name: "Health Insurance", icon: null, isIncome: false },
      { name: "Medical", icon: null, isIncome: false },
      { name: "Pharmacy", icon: null, isIncome: false },
      { name: "Fitness", icon: null, isIncome: false },
    ],
  },
  {
    name: "Personal",
    icon: "user",
    categories: [
      { name: "Entertainment", icon: null, isIncome: false },
      { name: "Subscriptions", icon: null, isIncome: false },
      { name: "Education", icon: null, isIncome: false },
      { name: "Gifts", icon: null, isIncome: false },
      { name: "Travel", icon: null, isIncome: false },
    ],
  },
];

export async function seedDefaultCategories(
  tx: Tx,
  householdId: string
): Promise<void> {
  for (let gi = 0; gi < DEFAULT_CATEGORIES.length; gi++) {
    const group = DEFAULT_CATEGORIES[gi];
    const groupId = uuid();

    await tx.insert(categoryGroups).values({
      id: groupId,
      householdId,
      name: group.name,
      icon: group.icon,
      sortOrder: gi,
      isSystem: true,
    });

    for (let ci = 0; ci < group.categories.length; ci++) {
      const cat = group.categories[ci];
      await tx.insert(categories).values({
        id: uuid(),
        householdId,
        groupId,
        name: cat.name,
        icon: cat.icon,
        isIncome: cat.isIncome,
        isSystem: true,
        sortOrder: ci,
      });
    }
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm typecheck
```

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/db/seed/categories.ts
git commit -m "feat: add default category seed data (8 groups, 32 categories)"
```

---

### Task 4: Household Provisioning Logic

**Files:**
- Create: `src/lib/auth/provision.ts`

- [ ] **Step 1: Create the provisioning function**

Create `src/lib/auth/provision.ts`:

```ts
import { v4 as uuid } from "uuid";
import { eq } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import {
  households,
  householdMembers,
  userSettings,
} from "@/db/schema";
import { seedDefaultCategories } from "@/db/seed/categories";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";

type Db = BetterSQLite3Database<typeof schema>;

export async function provisionHousehold(
  userId: string,
  db: Db = defaultDb
): Promise<string> {
  const existing = await db.query.householdMembers.findFirst({
    where: eq(householdMembers.userId, userId),
  });

  if (existing) {
    return existing.householdId;
  }

  const householdId = uuid();

  await db.transaction(async (tx) => {
    await tx.insert(households).values({
      id: householdId,
      name: "My Finances",
    });

    await tx.insert(householdMembers).values({
      id: uuid(),
      householdId,
      userId,
      role: "owner",
    });

    await tx.insert(userSettings).values({
      id: uuid(),
      userId,
    });

    await seedDefaultCategories(tx, householdId);
  });

  return householdId;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm typecheck
```

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth/provision.ts
git commit -m "feat: add household provisioning with category seeding"
```

---

### Task 5: Integration Tests for Provisioning

**Files:**
- Create: `tests/integration/onboarding.test.ts`

- [ ] **Step 1: Write all 5 integration tests**

Create `tests/integration/onboarding.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { eq, count } from "drizzle-orm";
import { createTestDb } from "./setup";
import { provisionHousehold } from "@/lib/auth/provision";
import { seedDefaultCategories, DEFAULT_CATEGORIES } from "@/db/seed/categories";
import {
  households,
  householdMembers,
  categoryGroups,
  categories,
  userSettings,
} from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";

describe("household provisioning", () => {
  let db: ReturnType<typeof createTestDb>["db"];
  let close: () => void;

  afterEach(() => {
    close?.();
  });

  function setup() {
    const result = createTestDb();
    db = result.db;
    close = result.close;
    return db;
  }

  it("creates household, member, settings, and default categories", async () => {
    const testDb = setup();
    const userId = "user-1";

    const householdId = await provisionHousehold(userId, testDb);

    const hh = await testDb.select().from(households).where(eq(households.id, householdId));
    expect(hh).toHaveLength(1);
    expect(hh[0].name).toBe("My Finances");

    const members = await testDb.select().from(householdMembers).where(eq(householdMembers.householdId, householdId));
    expect(members).toHaveLength(1);
    expect(members[0].userId).toBe(userId);
    expect(members[0].role).toBe("owner");

    const settings = await testDb.select().from(userSettings).where(eq(userSettings.userId, userId));
    expect(settings).toHaveLength(1);

    const groups = await testDb.select().from(categoryGroups).where(eq(categoryGroups.householdId, householdId));
    expect(groups).toHaveLength(DEFAULT_CATEGORIES.length);
    expect(groups.every((g) => g.isSystem === true)).toBe(true);

    const expectedCatCount = DEFAULT_CATEGORIES.reduce((sum, g) => sum + g.categories.length, 0);
    const cats = await testDb.select().from(categories).where(eq(categories.householdId, householdId));
    expect(cats).toHaveLength(expectedCatCount);
    expect(cats.every((c) => c.isSystem === true)).toBe(true);

    const incomeCats = cats.filter((c) => c.isIncome === true);
    const expectedIncome = DEFAULT_CATEGORIES.find((g) => g.name === "Income")!.categories.length;
    expect(incomeCats).toHaveLength(expectedIncome);
  });

  it("rolls back all rows on transaction failure (atomicity)", async () => {
    const testDb = setup();
    const userId = "user-atomicity";

    // Insert a conflicting household_member to trigger unique constraint violation
    // on a second call with a different household but same userId
    const householdId = await provisionHousehold(userId, testDb);

    // Manually insert a second household and try to add same user — should fail
    const { v4: uuid } = await import("uuid");
    const secondHouseholdId = uuid();
    await testDb.insert(households).values({ id: secondHouseholdId, name: "Conflict" });

    await expect(
      testDb.insert(householdMembers).values({
        id: uuid(),
        householdId: secondHouseholdId,
        userId,
        role: "owner",
      })
    ).rejects.toThrow();

    // Original household should still be intact
    const hh = await testDb.select().from(households).where(eq(households.id, householdId));
    expect(hh).toHaveLength(1);
  });

  it("does not create a duplicate household (idempotency)", async () => {
    const testDb = setup();
    const userId = "user-idempotent";

    const id1 = await provisionHousehold(userId, testDb);
    const id2 = await provisionHousehold(userId, testDb);

    expect(id1).toBe(id2);

    const allHouseholds = await testDb.select().from(households);
    expect(allHouseholds).toHaveLength(1);

    const allMembers = await testDb.select().from(householdMembers);
    expect(allMembers).toHaveLength(1);
  });

  it("isolates categories between households", async () => {
    const testDb = setup();

    const hhA = await provisionHousehold("user-a", testDb);
    const hhB = await provisionHousehold("user-b", testDb);

    const scopeA = scopedQuery(hhA, testDb);
    const scopeB = scopedQuery(hhB, testDb);

    const catsA = await testDb
      .select()
      .from(categoryGroups)
      .where(scopeA.where(categoryGroups));
    const catsB = await testDb
      .select()
      .from(categoryGroups)
      .where(scopeB.where(categoryGroups));

    expect(catsA).toHaveLength(DEFAULT_CATEGORIES.length);
    expect(catsB).toHaveLength(DEFAULT_CATEGORIES.length);

    const idsA = new Set(catsA.map((c) => c.id));
    const idsB = new Set(catsB.map((c) => c.id));
    const overlap = [...idsA].filter((id) => idsB.has(id));
    expect(overlap).toHaveLength(0);
  });

  it("provisions via self-healing when hook was skipped", async () => {
    const testDb = setup();
    const userId = "user-selfheal";

    // Simulate: user exists but no household (hook failed)
    // Calling provisionHousehold should create everything
    const householdId = await provisionHousehold(userId, testDb);

    expect(householdId).toBeTruthy();
    const members = await testDb
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.userId, userId));
    expect(members).toHaveLength(1);
    expect(members[0].role).toBe("owner");
  });
});
```

- [ ] **Step 2: Run the tests**

```bash
pnpm vitest run tests/integration/onboarding.test.ts
```

Expected: All 5 tests PASS. If any fail due to migration issues (Better Auth tables missing from test DB), the test DB factory only applies Drizzle migrations — Better Auth's tables aren't needed for these tests since we're testing `provisionHousehold` directly, not the auth flow.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/onboarding.test.ts
git commit -m "test: add onboarding integration tests (provisioning, atomicity, idempotency, isolation)"
```

---

### Task 6: Update Better Auth Config with databaseHooks

**Files:**
- Modify: `src/lib/auth/index.ts`

- [ ] **Step 1: Add databaseHooks to auth config**

Replace the contents of `src/lib/auth/index.ts`:

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";
import { provisionHousehold } from "./provision";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          try {
            await provisionHousehold(user.id);
          } catch {
            // Swallowed intentionally — self-healing in getHouseholdId() recovers.
            // Logging would be ideal but console.error is fine for self-hosted.
            console.error(`Failed to provision household for user ${user.id}`);
          }
        },
      },
    },
  },
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm typecheck
```

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth/index.ts
git commit -m "feat: add databaseHooks for auto household provisioning on signup"
```

---

### Task 7: Update Auth Client with baseURL

**Files:**
- Modify: `src/lib/auth/client.ts`
- Modify: `.env.example`

- [ ] **Step 1: Update auth client**

Replace the contents of `src/lib/auth/client.ts`:

```ts
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
});

export type Session = typeof authClient.$Infer.Session;
```

- [ ] **Step 2: Add NEXT_PUBLIC_APP_URL to .env.example**

Add this line after the `BETTER_AUTH_URL` entry in `.env.example`:

```
NEXT_PUBLIC_APP_URL=http://localhost:3000  # Public URL — must match BETTER_AUTH_URL. Set to actual domain in production.
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth/client.ts .env.example
git commit -m "feat: add explicit baseURL to auth client for proxy compatibility"
```

---

### Task 8: Session Helpers with Self-Healing

**Files:**
- Create: `src/lib/auth/session.ts`

- [ ] **Step 1: Create session helpers**

Create `src/lib/auth/session.ts`:

```ts
import { cache } from "react";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { householdMembers } from "@/db/schema";
import { provisionHousehold } from "./provision";

export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

export const getHouseholdId = cache(async (): Promise<string> => {
  const session = await getSession();
  if (!session) {
    throw new Error("Not authenticated");
  }

  const member = await db.query.householdMembers.findFirst({
    where: eq(householdMembers.userId, session.user.id),
  });

  if (member) {
    return member.householdId;
  }

  return provisionHousehold(session.user.id);
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm typecheck
```

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth/session.ts
git commit -m "feat: add session helpers with self-healing household provisioning"
```

---

### Task 9: Update Middleware for Cryptographic Session Validation

**Files:**
- Modify: `src/middleware.ts`

- [ ] **Step 1: Update middleware to use auth.api.getSession()**

Replace the contents of `src/middleware.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const publicPaths = ["/login", "/signup", "/api/auth", "/api/health"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public).*)"],
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm typecheck
```

Expected: No type errors. Note: `auth.api.getSession()` requires the Better Auth tables to exist in the database. This will work at runtime but may show warnings if the DB hasn't been migrated yet.

- [ ] **Step 3: Commit**

```bash
git add src/middleware.ts
git commit -m "fix: upgrade middleware to cryptographic session validation"
```

---

### Task 10: Auth Card Component

**Files:**
- Create: `src/components/auth/auth-card.tsx`

- [ ] **Step 1: Create the AuthCard component**

Create `src/components/auth/auth-card.tsx`:

```tsx
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface AuthCardProps {
  title: string;
  description: string;
  footer: {
    text: string;
    linkText: string;
    href: string;
  };
  children: React.ReactNode;
}

export function AuthCard({ title, description, footer, children }: AuthCardProps) {
  return (
    <Card className="w-full max-w-sm shadow-lg shadow-black/5">
      <CardHeader className="text-center pb-2">
        <p className="text-2xl font-bold tracking-tight mb-1">Ledgr</p>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          {footer.text}{" "}
          <Link
            href={footer.href}
            className="text-foreground underline-offset-4 hover:underline font-medium"
          >
            {footer.linkText}
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/components/auth/auth-card.tsx
git commit -m "feat: add AuthCard component"
```

---

### Task 11: Login Form Component

**Files:**
- Create: `src/components/auth/login-form.tsx`

- [ ] **Step 1: Create the LoginForm component**

Create `src/components/auth/login-form.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const AUTH_ERRORS: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Invalid email or password.",
  USER_NOT_FOUND: "Invalid email or password.",
  INVALID_PASSWORD: "Invalid email or password.",
};

interface LoginFormProps {
  callbackUrl: string;
}

export function LoginForm({ callbackUrl }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const { error } = await authClient.signIn.email({
        email,
        password,
      });

      if (error) {
        setError(AUTH_ERRORS[error.code ?? ""] ?? "Something went wrong. Please try again.");
        return;
      }

      router.push(callbackUrl);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="you@example.com"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-describedby={error ? "form-error" : undefined}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby={error ? "form-error" : undefined}
        />
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Signing in..." : "Sign in"}
      </Button>

      {error && (
        <p id="form-error" role="alert" className="text-sm text-destructive text-center">
          {error}
        </p>
      )}
    </form>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/components/auth/login-form.tsx
git commit -m "feat: add LoginForm component"
```

---

### Task 12: Signup Form Component

**Files:**
- Create: `src/components/auth/signup-form.tsx`

- [ ] **Step 1: Create the SignupForm component**

Create `src/components/auth/signup-form.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const AUTH_ERRORS: Record<string, string> = {
  USER_ALREADY_EXISTS: "An account with this email already exists.",
};

export function SignupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    startTransition(async () => {
      const { error } = await authClient.signUp.email({
        email,
        password,
        name,
      });

      if (error) {
        setError(AUTH_ERRORS[error.code ?? ""] ?? "Something went wrong. Please try again.");
        return;
      }

      router.push("/");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          type="text"
          placeholder="Your name"
          required
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="you@example.com"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-describedby={error ? "form-error" : undefined}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby="password-hint"
        />
        <p id="password-hint" className="text-xs text-muted-foreground">
          Must be at least 8 characters.
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="confirm-password">Confirm Password</Label>
        <Input
          id="confirm-password"
          type="password"
          required
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating account..." : "Create account"}
      </Button>

      {error && (
        <p id="form-error" role="alert" className="text-sm text-destructive text-center">
          {error}
        </p>
      )}
    </form>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/components/auth/signup-form.tsx
git commit -m "feat: add SignupForm component with confirm password"
```

---

### Task 13: Auth Layout

**Files:**
- Create: `src/app/(auth)/layout.tsx`

- [ ] **Step 1: Create the auth layout**

Create `src/app/(auth)/layout.tsx`:

```tsx
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 px-4">
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\(auth\)/layout.tsx
git commit -m "feat: add centered auth layout"
```

---

### Task 14: Login Page

**Files:**
- Create: `src/app/(auth)/login/page.tsx`

- [ ] **Step 1: Create the login page**

Create `src/app/(auth)/login/page.tsx`:

```tsx
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";
import { sanitizeCallbackUrl } from "@/lib/url";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;

  return (
    <AuthCard
      title="Welcome back"
      description="Sign in to your account"
      footer={{
        text: "Don't have an account?",
        linkText: "Sign up",
        href: "/signup",
      }}
    >
      <LoginForm callbackUrl={sanitizeCallbackUrl(callbackUrl ?? null)} />
    </AuthCard>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\(auth\)/login/page.tsx
git commit -m "feat: add login page"
```

---

### Task 15: Signup Page

**Files:**
- Create: `src/app/(auth)/signup/page.tsx`

- [ ] **Step 1: Create the signup page**

Create `src/app/(auth)/signup/page.tsx`:

```tsx
import { AuthCard } from "@/components/auth/auth-card";
import { SignupForm } from "@/components/auth/signup-form";

export default function SignupPage() {
  return (
    <AuthCard
      title="Create your account"
      description="Start tracking your finances"
      footer={{
        text: "Already have an account?",
        linkText: "Sign in",
        href: "/login",
      }}
    >
      <SignupForm />
    </AuthCard>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\(auth\)/signup/page.tsx
git commit -m "feat: add signup page"
```

---

### Task 16: Dashboard Layout and Landing Page

**Files:**
- Create: `src/app/(dashboard)/layout.tsx`
- Create: `src/app/(dashboard)/page.tsx`

- [ ] **Step 1: Create the dashboard layout**

Create `src/app/(dashboard)/layout.tsx`:

```tsx
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen">{children}</div>;
}
```

- [ ] **Step 2: Create the dashboard landing page**

Create `src/app/(dashboard)/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getSession, getHouseholdId } from "@/lib/auth/session";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const householdId = await getHouseholdId();

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Welcome to Ledgr</h1>
        <p className="mt-2 text-muted-foreground">
          Your finances are ready. Dashboard coming in Phase 6.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/layout.tsx src/app/\(dashboard\)/page.tsx
git commit -m "feat: add dashboard layout and landing page stub"
```

---

### Task 17: Remove Root Page Stub and Update Metadata

**Files:**
- Delete: `src/app/page.tsx`
- Modify: `src/app/layout.tsx`

Route groups with parentheses `(dashboard)` do NOT add a URL segment. So `src/app/(dashboard)/page.tsx` serves at `/`. The existing `src/app/page.tsx` conflicts with this. Delete it — the `(dashboard)` page from Task 16 handles `/` for authenticated users, and middleware redirects unauthenticated users to `/login`.

- [ ] **Step 1: Delete the root page stub**

```bash
rm src/app/page.tsx
```

- [ ] **Step 2: Update root layout metadata**

Edit `src/app/layout.tsx` — update only the metadata:

```tsx
export const metadata: Metadata = {
  title: "Ledgr",
  description: "Self-hosted personal finance",
};
```

Keep everything else (fonts, body classes) unchanged.

- [ ] **Step 3: Verify the dev server starts**

```bash
pnpm dev
```

Expected: dev server starts. Visiting `http://localhost:3000` should redirect to `/login` (middleware catches unauthenticated request).

- [ ] **Step 4: Commit**

```bash
git add -A src/app/page.tsx src/app/layout.tsx src/app/\(dashboard\)/page.tsx
git commit -m "feat: remove root page stub, update metadata to Ledgr"
```

---

### Task 18: Database Migration Setup

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add db:setup script**

Add to the `scripts` section of `package.json`, after the `db:studio` entry:

```json
"db:setup": "pnpm dlx better-auth migrate && pnpm db:migrate",
"db:seed": "tsx src/db/seed/run.ts",
```

Note: The `db:seed` script will be fully implemented in a future phase (Phase 7 — Demo Mode). For now it's a placeholder path.

- [ ] **Step 2: Run Better Auth migration**

```bash
pnpm dlx better-auth migrate
```

Expected: Better Auth creates its `user`, `session`, `account`, and `verification` tables in the SQLite database.

- [ ] **Step 3: Run Drizzle migration**

```bash
pnpm db:migrate
```

Expected: Drizzle applies the existing migration for application tables.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore: add db:setup script (Better Auth migrate + Drizzle migrate)"
```

---

### Task 19: Manual Smoke Test

**Files:** None (testing only)

- [ ] **Step 1: Start the dev server**

```bash
pnpm dev
```

- [ ] **Step 2: Test the login page**

Visit `http://localhost:3000`. Expected:
- Redirected to `/login`
- See centered card with "Ledgr" heading, "Welcome back" title, email/password fields, "Sign in" button
- "Don't have an account? Sign up" footer link
- Dark mode works if OS is in dark mode

- [ ] **Step 3: Test the signup flow**

Click "Sign up" link. Expected:
- Navigate to `/signup`
- See "Create your account" card with name, email, password, confirm password fields
- Password hint "Must be at least 8 characters." visible
- "Already have an account? Sign in" footer link

Fill in the form and submit. Expected:
- Account created
- Redirected to `/` (dashboard page)
- See "Welcome to Ledgr" message

- [ ] **Step 4: Test login with the created account**

Open an incognito window, visit `http://localhost:3000`. Expected:
- Redirected to `/login`
- Enter credentials, click "Sign in"
- Redirected to `/` (dashboard page)

- [ ] **Step 5: Test error states**

- Try logging in with wrong password → "Invalid email or password."
- Try signing up with existing email → "An account with this email already exists."
- Try signing up with mismatched passwords → "Passwords do not match."
- Try signing up with password < 8 chars → browser native validation prevents submission

- [ ] **Step 6: Verify household was created**

```bash
pnpm db:studio
```

Open Drizzle Studio and verify:
- `user` table has the new user
- `households` table has "My Finances"
- `household_members` table has entry with `role = "owner"`
- `category_groups` table has 8 groups with `is_system = 1`
- `categories` table has 32 categories
- `user_settings` table has entry for the user

---

### Task 20: E2E Test

**Files:**
- Create: `e2e/auth.spec.ts`

- [ ] **Step 1: Write the E2E test**

Create `e2e/auth.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("signup creates account and redirects to dashboard", async ({ page }) => {
  const uniqueEmail = `test-${Date.now()}@example.com`;

  await page.goto("/signup");

  await expect(page.getByRole("heading", { name: "Ledgr" })).toBeVisible();
  await expect(page.getByText("Create your account")).toBeVisible();

  await page.getByLabel("Name").fill("Test User");
  await page.getByLabel("Email").fill(uniqueEmail);
  await page.getByLabel("Password", { exact: true }).fill("testpassword123");
  await page.getByLabel("Confirm Password").fill("testpassword123");

  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL("/", { timeout: 10000 });
  await expect(page.getByText("Welcome to Ledgr")).toBeVisible();
});
```

- [ ] **Step 2: Run the E2E test**

Make sure the dev server is running in another terminal, then:

```bash
pnpm test:e2e e2e/auth.spec.ts
```

Expected: 1 test PASS.

- [ ] **Step 3: Commit**

```bash
git add e2e/auth.spec.ts
git commit -m "test: add E2E signup flow test"
```

---

### Task 21: Type Check and Lint

**Files:** None (validation only)

- [ ] **Step 1: Run type check**

```bash
pnpm typecheck
```

Expected: No type errors.

- [ ] **Step 2: Run linter**

```bash
pnpm lint
```

Expected: No lint errors. Fix any that appear.

- [ ] **Step 3: Run all unit/integration tests**

```bash
pnpm test
```

Expected: All tests pass (url.test.ts, encryption.test.ts, money.test.ts, onboarding.test.ts, db-factory.test.ts, scoped-query.test.ts).

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: resolve type check and lint issues"
```
