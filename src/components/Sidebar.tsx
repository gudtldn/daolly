import { NavLink } from "react-router";
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  TrendingUp,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useSettingsStore } from "@/stores/settingsStore";
import { Logo } from "@/components/Logo";

const mainNavItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "대시보드" },
  { to: "/pos", icon: ShoppingCart, label: "접수 / 출고" },
  { to: "/customers", icon: Users, label: "고객 관리" },
  { to: "/sales", icon: TrendingUp, label: "매출 관리" },
];

const bottomNavItems = [
  { to: "/settings", icon: Settings, label: "환경 설정" },
];

export function Sidebar() {
  const collapsed = useSettingsStore((s) => s.ui.sidebarCollapsed);
  const toggleSidebar = useSettingsStore((s) => s.toggleSidebar);

  return (
    <aside
      className={`${
        collapsed ? "w-16" : "w-60"
      } bg-secondary-900 text-white flex flex-col shrink-0 transition-[width] duration-200 overflow-hidden`}
    >
      {/* 로고 영역 */}
      <div className="h-16 flex items-center px-4 bg-secondary-950 border-b border-secondary-800">
        {collapsed ? (
          <button
            onClick={toggleSidebar}
            title="사이드바 펼치기"
            className="w-full flex items-center justify-center text-secondary-400 hover:text-white transition-colors cursor-pointer"
            aria-label="사이드바 펼치기"
          >
            <PanelLeftOpen className="w-5 h-5" />
          </button>
        ) : (
          <>
            <div className="flex items-center min-w-0 flex-1 whitespace-nowrap overflow-hidden">
              <Logo size="md" />
            </div>
            <button
              onClick={toggleSidebar}
              title="사이드바 접기"
              className="text-secondary-400 hover:text-white transition-colors shrink-0 cursor-pointer ml-2"
              aria-label="사이드바 접기"
            >
              <PanelLeftClose className="w-5 h-5" />
            </button>
          </>
        )}
      </div>

      {/* 메인 네비게이션 */}
      <nav className="flex-1 py-2 space-y-1 overflow-y-auto overflow-x-hidden">
        {mainNavItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) =>
              `flex items-center whitespace-nowrap ${
                collapsed ? "justify-center px-0 py-3" : "px-5 py-3"
              } transition-colors ${
                isActive
                  ? "bg-primary-600 text-white font-bold"
                  : "text-secondary-400 hover:bg-secondary-800 hover:text-white"
              }`
            }
          >
            <item.icon className={`w-5 h-5 shrink-0 ${collapsed ? "" : "mr-3"}`} />
            {!collapsed && <span className="text-sm">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* 하단 고정 메뉴 (환경 설정) */}
      <div className="border-t border-secondary-800 py-2">
        {bottomNavItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) =>
              `flex items-center whitespace-nowrap ${
                collapsed ? "justify-center px-0 py-3" : "px-5 py-3"
              } transition-colors ${
                isActive
                  ? "bg-primary-600 text-white font-bold"
                  : "text-secondary-400 hover:bg-secondary-800 hover:text-white"
              }`
            }
          >
            <item.icon className={`w-5 h-5 shrink-0 ${collapsed ? "" : "mr-3"}`} />
            {!collapsed && <span className="text-sm">{item.label}</span>}
          </NavLink>
        ))}
      </div>
    </aside>
  );
}
