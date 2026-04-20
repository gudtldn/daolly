import { NavLink } from "react-router";
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  TrendingUp,
  Settings,
  Shirt,
  User,
} from "lucide-react";

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
  return (
    <aside className="w-60 bg-secondary-900 text-white flex flex-col shrink-0">
      {/* 로고 영역 */}
      <div className="h-16 flex items-center px-5 bg-secondary-950 border-b border-secondary-800">
        <Shirt className="w-6 h-6 text-primary-400 mr-3" />
        <h1 className="text-xl font-bold tracking-wider">Sidekick</h1>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 py-2 space-y-1 overflow-y-auto">
        {mainNavItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center px-5 py-3 transition-colors ${
                isActive
                  ? "bg-primary-600 text-white"
                  : "text-secondary-400 hover:bg-secondary-800 hover:text-white"
              }`
            }
          >
            <item.icon className="w-5 h-5 mr-3" />
            <span className="text-sm">{item.label}</span>
          </NavLink>
        ))}

        {/* 구분선 */}
        <div className="mx-5 my-4 border-t border-secondary-800" />

        {bottomNavItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center px-5 py-3 transition-colors ${
                isActive
                  ? "bg-primary-600 text-white"
                  : "text-secondary-400 hover:bg-secondary-800 hover:text-white"
              }`
            }
          >
            <item.icon className="w-5 h-5 mr-3" />
            <span className="text-sm">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* 사용자 정보 */}
      <div className="p-4 border-t border-secondary-800 flex items-center">
        <div className="w-9 h-9 rounded-full bg-secondary-700 flex items-center justify-center mr-3">
          <User className="w-5 h-5 text-secondary-400" />
        </div>
        <div>
          <p className="text-sm font-semibold">관리자</p>
          <p className="text-xs text-secondary-500">Sidekick</p>
        </div>
      </div>
    </aside>
  );
}
