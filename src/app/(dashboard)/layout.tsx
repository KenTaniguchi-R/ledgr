import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { SidebarNav } from "@/components/organisms/sidebar-nav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarNav
        userName={session.user?.name ?? "User"}
        userEmail={session.user?.email ?? ""}
      />
      <main className="flex-1 overflow-auto px-6 py-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
