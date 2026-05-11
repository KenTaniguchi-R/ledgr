import { v4 as uuid } from "uuid";
import { eq } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import {
  households,
  plaidItems,
  syncLog,
  accounts,
  balanceHistory,
  merchants,
  transactions,
  budgets,
  budgetCategories,
  recurringTransactions,
  investmentHoldings,
  holdingsHistory,
  categories,
} from "@/db/schema";
import { seedDefaultCategories } from "@/db/seed/categories";
import { encrypt } from "@/lib/encryption";
import { DEMO_HOUSEHOLD_ID } from "@/lib/demo-mode";
import { nowISO } from "@/lib/date-utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a Date as YYYY-MM-DD */
function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Get a date N days ago from now */
function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Deterministic variation using sine — returns value in [-amplitude, +amplitude] */
function sineVariation(index: number, period: number, amplitude: number): number {
  return Math.round(Math.sin((index * 2 * Math.PI) / period) * amplitude);
}

/** Get current month as YYYY-MM */
function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLAID_ITEM_CHASE = "demo-plaid-item-chase";
const PLAID_ITEM_VANGUARD = "demo-plaid-item-vanguard";

const ACCOUNT_CHECKING = "demo-account-checking";
const ACCOUNT_SAVINGS = "demo-account-savings";
const ACCOUNT_CREDIT = "demo-account-credit";
const ACCOUNT_INVESTMENT = "demo-account-investment";
const ACCOUNT_CAR_LOAN = "demo-account-car-loan";

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function seedDemoHousehold(db: LedgrDb = defaultDb): void {
  // Idempotency check
  const existing = db
    .select({ id: households.id })
    .from(households)
    .where(eq(households.id, DEMO_HOUSEHOLD_ID))
    .get();

  if (existing) return;

  const now = nowISO();

  db.transaction((tx) => {
    // ------------------------------------------------------------------
    // 1. Household
    // ------------------------------------------------------------------
    tx.insert(households)
      .values({ id: DEMO_HOUSEHOLD_ID, name: "Demo Household", createdAt: now, updatedAt: now })
      .run();

    // ------------------------------------------------------------------
    // 2. Categories (uses existing seed function)
    // ------------------------------------------------------------------
    seedDefaultCategories(tx, DEMO_HOUSEHOLD_ID);

    // Retrieve seeded categories for later reference
    const allCategories = tx
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(eq(categories.householdId, DEMO_HOUSEHOLD_ID))
      .all();

    const catByName = new Map(allCategories.map((c) => [c.name, c.id]));

    // ------------------------------------------------------------------
    // 3. Plaid Items
    // ------------------------------------------------------------------
    tx.insert(plaidItems)
      .values([
        {
          id: PLAID_ITEM_CHASE,
          householdId: DEMO_HOUSEHOLD_ID,
          accessToken: encrypt("demo-not-a-real-token-chase"),
          plaidItemId: "demo-item-chase-0001",
          plaidInstitutionId: "ins_3",
          institutionName: "Chase",
          primaryColor: "#0A2540",
          status: "active",
          syncCursor: "demo-cursor-chase-001",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: PLAID_ITEM_VANGUARD,
          householdId: DEMO_HOUSEHOLD_ID,
          accessToken: encrypt("demo-not-a-real-token-vanguard"),
          plaidItemId: "demo-item-vanguard-0001",
          plaidInstitutionId: "ins_115617",
          institutionName: "Vanguard",
          primaryColor: "#c51a16",
          status: "active",
          syncCursor: "demo-cursor-vanguard-001",
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();

    // ------------------------------------------------------------------
    // 4. Sync Log (4 entries, 2 per item)
    // ------------------------------------------------------------------
    tx.insert(syncLog)
      .values([
        {
          id: uuid(),
          plaidItemId: PLAID_ITEM_CHASE,
          syncedAt: toDateStr(daysAgo(1)) + "T08:00:00.000Z",
          cursorBefore: "demo-cursor-chase-000",
          cursorAfter: "demo-cursor-chase-001",
          addedCount: 12,
          modifiedCount: 0,
          removedCount: 0,
        },
        {
          id: uuid(),
          plaidItemId: PLAID_ITEM_CHASE,
          syncedAt: toDateStr(daysAgo(3)) + "T08:00:00.000Z",
          cursorBefore: null,
          cursorAfter: "demo-cursor-chase-000",
          addedCount: 45,
          modifiedCount: 2,
          removedCount: 0,
        },
        {
          id: uuid(),
          plaidItemId: PLAID_ITEM_VANGUARD,
          syncedAt: toDateStr(daysAgo(1)) + "T09:00:00.000Z",
          cursorBefore: "demo-cursor-vanguard-000",
          cursorAfter: "demo-cursor-vanguard-001",
          addedCount: 3,
          modifiedCount: 0,
          removedCount: 0,
        },
        {
          id: uuid(),
          plaidItemId: PLAID_ITEM_VANGUARD,
          syncedAt: toDateStr(daysAgo(5)) + "T09:00:00.000Z",
          cursorBefore: null,
          cursorAfter: "demo-cursor-vanguard-000",
          addedCount: 8,
          modifiedCount: 1,
          removedCount: 0,
        },
      ])
      .run();

    // ------------------------------------------------------------------
    // 5. Accounts
    // ------------------------------------------------------------------
    tx.insert(accounts)
      .values([
        {
          id: ACCOUNT_CHECKING,
          householdId: DEMO_HOUSEHOLD_ID,
          plaidItemId: PLAID_ITEM_CHASE,
          plaidAccountId: "demo-plaid-acct-checking",
          name: "Main Checking",
          type: "checking",
          currentBalance: 420000,
          availableBalance: 415000,
          currency: "USD",
          isManual: false,
          isHidden: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: ACCOUNT_SAVINGS,
          householdId: DEMO_HOUSEHOLD_ID,
          plaidItemId: PLAID_ITEM_CHASE,
          plaidAccountId: "demo-plaid-acct-savings",
          name: "Emergency Fund",
          type: "savings",
          currentBalance: 1250000,
          availableBalance: 1250000,
          currency: "USD",
          isManual: false,
          isHidden: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: ACCOUNT_CREDIT,
          householdId: DEMO_HOUSEHOLD_ID,
          plaidItemId: PLAID_ITEM_CHASE,
          plaidAccountId: "demo-plaid-acct-credit",
          name: "Everyday Card",
          type: "credit",
          currentBalance: -180000,
          creditLimit: 1000000,
          currency: "USD",
          isManual: false,
          isHidden: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: ACCOUNT_INVESTMENT,
          householdId: DEMO_HOUSEHOLD_ID,
          plaidItemId: PLAID_ITEM_VANGUARD,
          plaidAccountId: "demo-plaid-acct-investment",
          name: "Brokerage",
          type: "investment",
          currentBalance: 4500000,
          currency: "USD",
          isManual: false,
          isHidden: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: ACCOUNT_CAR_LOAN,
          householdId: DEMO_HOUSEHOLD_ID,
          plaidItemId: null,
          name: "Car Loan",
          type: "loan",
          currentBalance: -820000,
          currency: "USD",
          isManual: true,
          isHidden: false,
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();

    // ------------------------------------------------------------------
    // 6. Merchants (~20)
    // ------------------------------------------------------------------
    const merchantDefs: { id: string; name: string; category: string }[] = [
      { id: "demo-merchant-acme-corp", name: "Acme Corp", category: "Salary" },
      { id: "demo-merchant-whole-foods", name: "Whole Foods", category: "Groceries" },
      { id: "demo-merchant-trader-joes", name: "Trader Joe's", category: "Groceries" },
      { id: "demo-merchant-chipotle", name: "Chipotle", category: "Restaurants" },
      { id: "demo-merchant-starbucks", name: "Starbucks", category: "Coffee Shops" },
      { id: "demo-merchant-shell", name: "Shell", category: "Gas" },
      { id: "demo-merchant-amazon", name: "Amazon", category: "Home Goods" },
      { id: "demo-merchant-netflix", name: "Netflix", category: "Subscriptions" },
      { id: "demo-merchant-spotify", name: "Spotify", category: "Subscriptions" },
      { id: "demo-merchant-planet-fitness", name: "Planet Fitness", category: "Fitness" },
      { id: "demo-merchant-target", name: "Target", category: "Home Goods" },
      { id: "demo-merchant-cvs", name: "CVS Pharmacy", category: "Pharmacy" },
      { id: "demo-merchant-comcast", name: "Comcast", category: "Internet" },
      { id: "demo-merchant-verizon", name: "Verizon", category: "Phone" },
      { id: "demo-merchant-uber", name: "Uber", category: "Public Transit" },
      { id: "demo-merchant-landlord", name: "Greenwood Properties", category: "Rent/Mortgage" },
      { id: "demo-merchant-con-edison", name: "Con Edison", category: "Electric" },
      { id: "demo-merchant-uniqlo", name: "Uniqlo", category: "Clothing" },
      { id: "demo-merchant-best-buy", name: "Best Buy", category: "Electronics" },
      { id: "demo-merchant-car-finance", name: "Auto Finance Co", category: "Car Payment" },
    ];

    tx.insert(merchants)
      .values(
        merchantDefs.map((m) => ({
          id: m.id,
          householdId: DEMO_HOUSEHOLD_ID,
          name: m.name,
          categoryId: catByName.get(m.category) ?? null,
          createdAt: now,
          updatedAt: now,
        }))
      )
      .run();

    // ------------------------------------------------------------------
    // 7. Transactions (~350 spanning 6 months)
    // ------------------------------------------------------------------
    const CATEGORY_SOURCES = ["rule", "rule", "rule", "pfc", "manual"] as const;

    // Template for generating realistic transactions
    const txnTemplates: { merchant: string; amountBase: number; category: string; frequency: number }[] = [
      // frequency = approximate times per month
      { merchant: "demo-merchant-whole-foods", amountBase: 8500, category: "Groceries", frequency: 5 },
      { merchant: "demo-merchant-trader-joes", amountBase: 6200, category: "Groceries", frequency: 3 },
      { merchant: "demo-merchant-chipotle", amountBase: 1450, category: "Restaurants", frequency: 4 },
      { merchant: "demo-merchant-starbucks", amountBase: 650, category: "Coffee Shops", frequency: 8 },
      { merchant: "demo-merchant-shell", amountBase: 5500, category: "Gas", frequency: 3 },
      { merchant: "demo-merchant-amazon", amountBase: 4500, category: "Home Goods", frequency: 3 },
      { merchant: "demo-merchant-target", amountBase: 3800, category: "Home Goods", frequency: 2 },
      { merchant: "demo-merchant-cvs", amountBase: 2200, category: "Pharmacy", frequency: 1 },
      { merchant: "demo-merchant-uber", amountBase: 2800, category: "Public Transit", frequency: 3 },
      { merchant: "demo-merchant-uniqlo", amountBase: 7500, category: "Clothing", frequency: 1 },
      { merchant: "demo-merchant-best-buy", amountBase: 12000, category: "Electronics", frequency: 1 },
    ];

    // Fixed monthly transactions
    const monthlyFixed: { merchant: string; amount: number; category: string; dayOfMonth: number }[] = [
      { merchant: "demo-merchant-landlord", amount: 225000, category: "Rent/Mortgage", dayOfMonth: 1 },
      { merchant: "demo-merchant-netflix", amount: 1599, category: "Subscriptions", dayOfMonth: 15 },
      { merchant: "demo-merchant-spotify", amount: 1099, category: "Subscriptions", dayOfMonth: 12 },
      { merchant: "demo-merchant-planet-fitness", amount: 2500, category: "Fitness", dayOfMonth: 5 },
      { merchant: "demo-merchant-comcast", amount: 8999, category: "Internet", dayOfMonth: 20 },
      { merchant: "demo-merchant-verizon", amount: 8500, category: "Phone", dayOfMonth: 18 },
      { merchant: "demo-merchant-con-edison", amount: 12000, category: "Electric", dayOfMonth: 22 },
      { merchant: "demo-merchant-car-finance", amount: 45000, category: "Car Payment", dayOfMonth: 8 },
    ];

    // Income: bi-weekly salary (every 14 days)
    const incomeEntries: { id: string; date: string; amount: number }[] = [];
    for (let i = 0; i < 13; i++) {
      // 13 pay periods in ~6 months
      const payDate = daysAgo(180 - i * 14);
      incomeEntries.push({
        id: `demo-txn-salary-${i}`,
        date: toDateStr(payDate),
        amount: 385000, // $3,850 net per pay period
      });
    }

    const txnRows: (typeof transactions.$inferInsert)[] = [];
    let txnIndex = 0;

    // Add salary income
    for (const income of incomeEntries) {
      txnRows.push({
        id: income.id,
        accountId: ACCOUNT_CHECKING,
        householdId: DEMO_HOUSEHOLD_ID,
        merchantId: "demo-merchant-acme-corp",
        categoryId: catByName.get("Salary") ?? null,
        date: income.date,
        originalName: "ACME CORP DIRECT DEP",
        name: "Acme Corp - Salary",
        amount: -income.amount, // Plaid: negative = income
        normalizedAmount: income.amount, // Normalized: positive = income
        currency: "USD",
        pending: false,
        reviewed: true,
        categorySource: "rule",
        createdAt: now,
        updatedAt: now,
      });
      txnIndex++;
    }

    // Add monthly fixed expenses
    for (let monthOffset = 0; monthOffset < 6; monthOffset++) {
      for (const fixed of monthlyFixed) {
        const d = new Date();
        d.setMonth(d.getMonth() - monthOffset);
        d.setDate(fixed.dayOfMonth);
        d.setHours(0, 0, 0, 0);
        // Skip if date is in the future
        if (d > new Date()) continue;

        const txId = `demo-txn-fixed-${fixed.merchant.replace("demo-merchant-", "")}-${monthOffset}`;
        // Add small deterministic variation to utility bills
        const variation = sineVariation(txnIndex, 7, Math.round(fixed.amount * 0.05));
        const amt = fixed.amount + variation;

        txnRows.push({
          id: txId,
          accountId: fixed.merchant === "demo-merchant-car-finance" ? ACCOUNT_CAR_LOAN : ACCOUNT_CREDIT,
          householdId: DEMO_HOUSEHOLD_ID,
          merchantId: fixed.merchant,
          categoryId: catByName.get(fixed.category) ?? null,
          date: toDateStr(d),
          originalName: merchantDefs.find((m) => m.id === fixed.merchant)!.name.toUpperCase(),
          name: merchantDefs.find((m) => m.id === fixed.merchant)!.name,
          amount: amt, // Plaid: positive = expense
          normalizedAmount: -amt, // Normalized: negative = expense
          currency: "USD",
          pending: false,
          reviewed: true,
          categorySource: CATEGORY_SOURCES[txnIndex % 5],
          createdAt: now,
          updatedAt: now,
        });
        txnIndex++;
      }
    }

    // Add variable spending transactions
    for (let dayOffset = 0; dayOffset < 180; dayOffset++) {
      const date = daysAgo(180 - dayOffset);
      const dateStr = toDateStr(date);

      for (let ti = 0; ti < txnTemplates.length; ti++) {
        const tmpl = txnTemplates[ti];
        // Deterministic: use modulo arithmetic to decide if transaction happens this day
        const hash = (dayOffset * 31 + ti * 7) % 30;
        const threshold = Math.round(30 / tmpl.frequency);
        if (hash >= threshold) continue;

        const amtVariation = sineVariation(txnIndex, 13, Math.round(tmpl.amountBase * 0.3));
        const amt = tmpl.amountBase + amtVariation;

        const txId = `demo-txn-var-${dayOffset}-${ti}`;

        txnRows.push({
          id: txId,
          accountId: ACCOUNT_CREDIT,
          householdId: DEMO_HOUSEHOLD_ID,
          merchantId: tmpl.merchant,
          categoryId: catByName.get(tmpl.category) ?? null,
          date: dateStr,
          originalName: merchantDefs.find((m) => m.id === tmpl.merchant)!.name.toUpperCase(),
          name: merchantDefs.find((m) => m.id === tmpl.merchant)!.name,
          amount: amt, // Plaid: positive = expense
          normalizedAmount: -amt, // Normalized: negative = expense
          currency: "USD",
          pending: false,
          reviewed: txnIndex % 4 !== 0,
          categorySource: CATEGORY_SOURCES[txnIndex % 5],
          createdAt: now,
          updatedAt: now,
        });
        txnIndex++;
      }
    }

    // Insert transactions in batches (SQLite has a variable limit)
    const BATCH_SIZE = 50;
    for (let i = 0; i < txnRows.length; i += BATCH_SIZE) {
      tx.insert(transactions).values(txnRows.slice(i, i + BATCH_SIZE)).run();
    }

    // ------------------------------------------------------------------
    // 8. Balance History (180 days per account)
    // ------------------------------------------------------------------
    const balanceRows: (typeof balanceHistory.$inferInsert)[] = [];

    const accountBalanceBases: { id: string; base: number; amplitude: number; period: number }[] = [
      { id: ACCOUNT_CHECKING, base: 420000, amplitude: 150000, period: 30 },
      { id: ACCOUNT_SAVINGS, base: 1250000, amplitude: 20000, period: 90 },
      { id: ACCOUNT_CREDIT, base: -180000, amplitude: 60000, period: 28 },
      { id: ACCOUNT_INVESTMENT, base: 4500000, amplitude: 200000, period: 60 },
      { id: ACCOUNT_CAR_LOAN, base: -820000, amplitude: 0, period: 1 },
    ];

    for (const acct of accountBalanceBases) {
      for (let day = 0; day < 180; day++) {
        const date = daysAgo(180 - day);
        const variation = sineVariation(day, acct.period, acct.amplitude);
        // Car loan decreases linearly
        const trend = acct.id === ACCOUNT_CAR_LOAN ? Math.round((day / 180) * 45000) : 0;
        // Investment grows over time
        const growth = acct.id === ACCOUNT_INVESTMENT ? Math.round((day / 180) * 300000) : 0;

        balanceRows.push({
          id: uuid(),
          accountId: acct.id,
          date: toDateStr(date),
          balance: acct.base + variation + trend + growth,
          createdAt: now,
        });
      }
    }

    for (let i = 0; i < balanceRows.length; i += BATCH_SIZE) {
      tx.insert(balanceHistory).values(balanceRows.slice(i, i + BATCH_SIZE)).run();
    }

    // ------------------------------------------------------------------
    // 9. Budgets (current month with 5 category limits)
    // ------------------------------------------------------------------
    const budgetId = "demo-budget-current";
    tx.insert(budgets)
      .values({
        id: budgetId,
        householdId: DEMO_HOUSEHOLD_ID,
        month: currentMonth(),
        type: "category",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const budgetCategoryLimits: { category: string; limit: number }[] = [
      { category: "Groceries", limit: 60000 },
      { category: "Restaurants", limit: 25000 },
      { category: "Subscriptions", limit: 10000 },
      { category: "Gas", limit: 20000 },
      { category: "Coffee Shops", limit: 8000 },
    ];

    tx.insert(budgetCategories)
      .values(
        budgetCategoryLimits.map((bc) => ({
          id: uuid(),
          budgetId,
          categoryId: catByName.get(bc.category)!,
          limitAmount: bc.limit,
          rollover: false,
          isFixed: false,
          createdAt: now,
        }))
      )
      .run();

    // ------------------------------------------------------------------
    // 10. Recurring Transactions (6)
    // ------------------------------------------------------------------
    const today = new Date();
    const nextMonth = new Date(today);
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    tx.insert(recurringTransactions)
      .values([
        {
          id: "demo-recurring-salary",
          householdId: DEMO_HOUSEHOLD_ID,
          accountId: ACCOUNT_CHECKING,
          name: "Acme Corp - Salary",
          merchantId: "demo-merchant-acme-corp",
          categoryId: catByName.get("Salary") ?? null,
          averageAmount: -385000,
          lastAmount: -385000,
          frequency: "biweekly",
          lastDate: toDateStr(daysAgo(7)),
          nextDate: toDateStr(daysAgo(-7)),
          isActive: true,
          isIncome: true,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "demo-recurring-rent",
          householdId: DEMO_HOUSEHOLD_ID,
          accountId: ACCOUNT_CREDIT,
          name: "Greenwood Properties - Rent",
          merchantId: "demo-merchant-landlord",
          categoryId: catByName.get("Rent/Mortgage") ?? null,
          averageAmount: 225000,
          lastAmount: 225000,
          frequency: "monthly",
          lastDate: toDateStr(daysAgo(today.getDate() - 1)),
          nextDate: `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`,
          isActive: true,
          isIncome: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "demo-recurring-netflix",
          householdId: DEMO_HOUSEHOLD_ID,
          accountId: ACCOUNT_CREDIT,
          name: "Netflix",
          merchantId: "demo-merchant-netflix",
          categoryId: catByName.get("Subscriptions") ?? null,
          averageAmount: 1599,
          lastAmount: 1599,
          frequency: "monthly",
          lastDate: toDateStr(daysAgo(15)),
          nextDate: toDateStr(daysAgo(-15)),
          isActive: true,
          isIncome: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "demo-recurring-spotify",
          householdId: DEMO_HOUSEHOLD_ID,
          accountId: ACCOUNT_CREDIT,
          name: "Spotify",
          merchantId: "demo-merchant-spotify",
          categoryId: catByName.get("Subscriptions") ?? null,
          averageAmount: 1099,
          lastAmount: 1099,
          frequency: "monthly",
          lastDate: toDateStr(daysAgo(18)),
          nextDate: toDateStr(daysAgo(-12)),
          isActive: true,
          isIncome: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "demo-recurring-gym",
          householdId: DEMO_HOUSEHOLD_ID,
          accountId: ACCOUNT_CREDIT,
          name: "Planet Fitness",
          merchantId: "demo-merchant-planet-fitness",
          categoryId: catByName.get("Fitness") ?? null,
          averageAmount: 2500,
          lastAmount: 2500,
          frequency: "monthly",
          lastDate: toDateStr(daysAgo(25)),
          nextDate: toDateStr(daysAgo(-5)),
          isActive: true,
          isIncome: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "demo-recurring-car-loan",
          householdId: DEMO_HOUSEHOLD_ID,
          accountId: ACCOUNT_CAR_LOAN,
          name: "Auto Finance Co - Car Loan",
          merchantId: "demo-merchant-car-finance",
          categoryId: catByName.get("Car Payment") ?? null,
          averageAmount: 45000,
          lastAmount: 45000,
          frequency: "monthly",
          lastDate: toDateStr(daysAgo(22)),
          nextDate: toDateStr(daysAgo(-8)),
          isActive: true,
          isIncome: false,
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();

    // ------------------------------------------------------------------
    // 11. Investment Holdings (3) + History
    // ------------------------------------------------------------------
    const holdingsDefs = [
      {
        id: "demo-holding-vti",
        ticker: "VTI",
        securityName: "Vanguard Total Stock Market ETF",
        plaidSecurityId: "demo-security-vti",
        quantity: 12.5,
        costBasis: 2500000,
        currentValue: 2850000,
        type: "etf" as const,
        sector: "Diversified",
      },
      {
        id: "demo-holding-aapl",
        ticker: "AAPL",
        securityName: "Apple Inc.",
        plaidSecurityId: "demo-security-aapl",
        quantity: 5.0,
        costBasis: 850000,
        currentValue: 950000,
        type: "stock" as const,
        sector: "Technology",
      },
      {
        id: "demo-holding-bnd",
        ticker: "BND",
        securityName: "Vanguard Total Bond Market ETF",
        plaidSecurityId: "demo-security-bnd",
        quantity: 8.0,
        costBasis: 640000,
        currentValue: 700000,
        type: "etf" as const,
        sector: "Fixed Income",
      },
    ];

    tx.insert(investmentHoldings)
      .values(
        holdingsDefs.map((h) => ({
          id: h.id,
          accountId: ACCOUNT_INVESTMENT,
          plaidSecurityId: h.plaidSecurityId,
          securityName: h.securityName,
          ticker: h.ticker,
          quantity: h.quantity,
          costBasis: h.costBasis,
          currentValue: h.currentValue,
          type: h.type,
          sector: h.sector,
          currency: "USD",
          asOfDate: toDateStr(new Date()),
          createdAt: now,
          updatedAt: now,
        }))
      )
      .run();

    // Holdings history — weekly snapshots for 6 months (~26 entries per holding)
    const holdingsHistoryRows: (typeof holdingsHistory.$inferInsert)[] = [];
    for (const h of holdingsDefs) {
      for (let week = 0; week < 26; week++) {
        const date = daysAgo(180 - week * 7);
        // Deterministic growth with sine variation
        const baseGrowth = Math.round(((h.currentValue - h.costBasis) / 26) * week);
        const variation = sineVariation(week, 8, Math.round(h.costBasis * 0.02));
        const value = h.costBasis + baseGrowth + variation;

        holdingsHistoryRows.push({
          id: uuid(),
          accountId: ACCOUNT_INVESTMENT,
          plaidSecurityId: h.plaidSecurityId,
          securityName: h.securityName,
          ticker: h.ticker,
          quantity: h.quantity,
          value,
          date: toDateStr(date),
          createdAt: now,
        });
      }
    }

    for (let i = 0; i < holdingsHistoryRows.length; i += BATCH_SIZE) {
      tx.insert(holdingsHistory).values(holdingsHistoryRows.slice(i, i + BATCH_SIZE)).run();
    }
  });
}
