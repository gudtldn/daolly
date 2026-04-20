import { Outlet } from "react-router";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";

export function Layout() {
  return (
    <div className="h-screen flex overflow-hidden bg-surface text-on-surface">
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
