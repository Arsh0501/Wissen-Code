import { Link, NavLink } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import BrandLogo from "../landing/BrandLogo";
import { useAuth } from "../../context/AuthContext";
import { getNavItemsForRole } from "./navItems";

export default function Sidebar() {
  const { role, user } = useAuth();
  const items = getNavItemsForRole(role, user?.accessRole);

  return (
    <aside className="workspace-sidebar hidden md:flex md:flex-col w-64 shrink-0 border-r border-surface-800 bg-surface-900/60">
      <Link to="/" className="workspace-brand" aria-label="Wissen Code home">
        <BrandLogo />
        <span className="sr-only">Wissen Code</span>
      </Link>
      <p className="workspace-nav-label">
        {role === "admin" ? "MAKE GREAT CONNECTIONS" : "YOUR NEXT CHAPTER"}
      </p>

      <nav aria-label="Primary" className="flex-1 px-3 py-5 space-y-1.5">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary-500/10 text-primary-700 ring-1 ring-primary-500/30"
                  : "text-surface-400 hover:text-white hover:bg-surface-800"
              }`
            }
          >
            <Icon className="w-4 h-4" />
            {label}
          </NavLink>
        ))}
      </nav>
      <Link
        to={role === "admin" ? "/admin/interviews" : "/profile"}
        className="workspace-side-note"
      >
        <img
          src="/images/wissen-mascot.png"
          alt=""
          width="1153"
          height="1364"
        />
        <span>
          <b>{role === "admin" ? "People first." : "Be your best you."}</b>
          <small>
            {role === "admin" ? "Meet your next teammate" : "Make it yours"}{" "}
            <ArrowUpRight size={12} />
          </small>
        </span>
      </Link>
      <p className="workspace-sidebar-footer">
        A little more human. <span aria-hidden="true">✳</span>
      </p>
    </aside>
  );
}
