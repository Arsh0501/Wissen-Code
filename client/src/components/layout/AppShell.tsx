import { Outlet, useLocation } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

// Shared application shell: persistent side navigation + topbar wrapping every authenticated page.
export default function AppShell() {
  const { pathname } = useLocation();
  const content = useRef<HTMLElement>(null);
  useEffect(() => {
    if (content.current) content.current.scrollTop = 0;
  }, [pathname]);
  const section = pathname.split('/')[2] || (pathname === '/profile' ? 'profile' : 'dashboard');
  return (
    <div
      className="workspace-shell h-dvh w-full bg-surface-950 flex overflow-hidden"
      data-section={section}
    >
      <a href="#workspace-content" className="skip-link">
        Skip to content
      </a>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <Topbar />
        <main
          ref={content}
          id="workspace-content"
          tabIndex={-1}
          className="workspace-main flex-1 min-w-0 min-h-0 overflow-y-auto"
        >
          <div className="workspace-route">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
