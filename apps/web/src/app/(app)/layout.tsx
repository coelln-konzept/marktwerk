import { AppSidebar } from "@/components/shell/app-sidebar";
import { requireUser } from "@/server/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="flex min-h-svh">
      <AppSidebar user={user} />
      <main className="flex-1 overflow-x-hidden">{children}</main>
    </div>
  );
}
