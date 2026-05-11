import { getHouseholdId, getSession } from "./session";
import { guardDemoMode } from "@/lib/demo-mode";

type AuthorizeResult =
  | { householdId: string; userId: string }
  | { error: string };

export async function authorizeAction(): Promise<AuthorizeResult> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };

  const blocked = await guardDemoMode(session.user.id);
  if (blocked) return blocked;

  const householdId = await getHouseholdId();
  return { householdId, userId: session.user.id };
}
