import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getUserAiSettings } from "@/queries/settings";
import { SidebarNav } from "@/components/organisms/sidebar-nav";
import { ChatPanelLoader } from "@/components/organisms/chat-panel-loader";
import { seedDemoHousehold } from "@/db/seed/demo";

seedDemoHousehold();

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const aiSettings = await getUserAiSettings(session.user.id);
  const hasAiConfigured = !!(aiSettings?.hasKey && aiSettings?.aiProvider);

  return (
    <>
      <div className="flex h-screen overflow-hidden">
        <SidebarNav
          userName={session.user?.name ?? "User"}
          userEmail={session.user?.email ?? ""}
        />
        <main className="flex-1 overflow-auto px-6 py-6 lg:px-8">
          {children}
        </main>
      </div>
      <ChatPanelLoader hasAiConfigured={hasAiConfigured} />
    </>
  );
}
