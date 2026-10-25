import { useEffect } from "react";
import { Outlet, useLocation } from "react-router";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { trackScreen } from "@/utils/usage";

export function Layout() {
  const { pathname } = useLocation();
  useEffect(() => trackScreen(pathname), [pathname]);

  return (
    <div className="h-screen flex overflow-hidden bg-surface text-on-surface transition-colors duration-200">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
