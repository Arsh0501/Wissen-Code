import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { LogOut, ChevronDown, ArrowLeft } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { getNavItemsForRole } from "./navItems";
import UserAvatar from "./UserAvatar";
import ThemeToggle from "../ThemeToggle";
import BrandLogo from "../landing/BrandLogo";

// Back goes one level up the page hierarchy rather than through browser history,
// so it never lands on a form the user just submitted.
export function getParentPath(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "admin") {
    const [, section, id] = parts;
    if (section === "reports" && parts[3])
      return `/admin/submissions/${parts[3]}`;
    if (section === "submissions") return "/admin/assessments";
    if ((section === "questions" || section === "assessments") && id)
      return `/admin/${section}`;
  }
  return "/";
}

export default function Topbar() {
  const { user, role, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const items = getNavItemsForRole(role, user?.accessRole);
  const current = items.find((item) =>
    item.to === "/"
      ? location.pathname === "/"
      : location.pathname.startsWith(item.to),
  );
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    function outside(event: PointerEvent) {
      if (!menu.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [menuOpen]);

  function handleLogout() {
    setMenuOpen(false);
    logout();
    navigate("/login", { replace: true });
  }

  function handleBack() {
    navigate(getParentPath(location.pathname));
  }

  return (
    <header className="workspace-topbar shrink-0 sticky top-0 z-40 bg-surface-900/80 backdrop-blur-xl border-b border-surface-800">
      <div className="flex flex-wrap items-center justify-between px-4 md:px-8 py-3 gap-3">
        <NavLink
          to="/"
          className="md:hidden workspace-mobile-brand"
          aria-label="Wissen Code home"
        >
          <BrandLogo />
        </NavLink>
        {location.pathname !== "/" && (
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm text-surface-400 hover:bg-surface-800 hover:text-white transition-colors cursor-pointer shrink-0"
            aria-label="Go back"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back</span>
          </button>
        )}
        <div className="workspace-breadcrumb hidden md:flex">
          <span>{role === "admin" ? "Hiring studio" : "My space"}</span>
          <span aria-hidden="true">/</span>
          <b>{current?.label || "Workspace"}</b>
        </div>
        <nav
          aria-label="Primary mobile"
          className="order-last w-full flex md:hidden gap-1 overflow-x-auto pb-1"
        >
          {items.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? "bg-primary-500/10 text-primary-700"
                    : "text-surface-400"
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <div className="relative" ref={menu}>
            <button
              ref={menuButton}
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-800 transition-colors cursor-pointer"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <UserAvatar user={user} />
              <span className="hidden sm:block text-left">
                <span className="block text-sm font-medium text-surface-200">
                  {user?.name}
                </span>
                <span className="block text-[10px] text-surface-500 capitalize">
                  {user?.accessRole === "recruiter"
                    ? "Recruiter"
                    : user?.accessRole === "interviewer"
                      ? "Interviewer"
                      : role === "admin"
                        ? "Administrator"
                        : "Candidate"}
                </span>
              </span>
              <ChevronDown className="w-4 h-4 text-surface-500" />
            </button>

            {menuOpen && (
              <div
                className="absolute right-0 mt-2 w-48 card p-1.5 shadow-xl"
                role="menu"
              >
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-500/10 cursor-pointer"
                  role="menuitem"
                >
                  <LogOut className="w-4 h-4" /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
