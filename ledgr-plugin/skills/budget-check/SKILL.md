---
name: ledgr:budget-check
description: Analyze budget vs actual spending and flag categories at risk of overspending
version: 1.0.0
tools:
  - get_budget
  - show_financial_dashboard
---

# Budget Check

## When to use

Use when the user asks about their budget, wants to know if they're on track, or asks about spending limits. Trigger phrases: "how's my budget", "am I on track", "budget status", "over budget".

## Steps

1. **Get current budget.** Call `get_budget` with no month parameter (defaults to current month).

2. **Check if budget exists.** If the response has `budgetType: null`, tell the user they haven't set up a budget for this month and suggest they do so in the Ledgr app.

3. **Calculate projections.** For each category:
   - `percentUsed` is already provided
   - Calculate days elapsed and days remaining in the month
   - Projected month-end spend: `(spentCents / daysElapsed) * totalDaysInMonth`
   - Flag if projected > allocated

4. **Identify at-risk categories.** A category is at risk if:
   - `percentUsed > 80` AND more than 10 days remain in the month
   - OR projected month-end spend exceeds allocation by >10%

5. **Identify under-budget categories.** Categories with `percentUsed < 50` and more than half the month elapsed — potential reallocation sources.

6. **Show the visual.** Call `show_financial_dashboard` with `view: "budget-progress"`.

7. **Present the summary.** Structure:
   - Overall: "You've spent [spentDisplay] of [allocatedDisplay] ([X%]) with [N] days remaining"
   - At-risk categories with projected overspend amount
   - Under-budget categories with remaining amount
   - If reallocation makes sense, suggest specific moves

## Important

- Always use `amountDisplay` fields for presenting money to the user.
- Do not store or cache any financial data beyond this conversation.
