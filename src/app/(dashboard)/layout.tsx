import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getUserAiSettings } from "@/queries/settings";
import { DashboardShell } from "@/components/organisms/dashboard-shell";
import { ChatPanelLoader } from "@/components/organisms/chat-panel-loader";
import { seedDemoHousehold } from "@/db/seed/demo";

seedDemoHousehold().catch((e) => console.error("[demo] seed failed:", e));

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const [aiSettings, cookieStore] = await Promise.all([
    getUserAiSettings(session.user.id),
    cookies(),
  ]);
  const hasAiConfigured = !!(aiSettings?.hasKey && aiSettings?.aiProvider);
  const sidebarDefaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <>
      <DashboardShell
        userName={session.user?.name ?? "User"}
        userEmail={session.user?.email ?? ""}
        defaultOpen={sidebarDefaultOpen}
      >
        {children}
      </DashboardShell>
      <ChatPanelLoader hasAiConfigured={hasAiConfigured} />
    </>
  );
}
