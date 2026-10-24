import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import ConnectionStatus from './ConnectionStatus';

// Shared application shell: persistent side navigation + topbar wrapping every authenticated page.
export default function AppShell() {
  return (
    <div className="h-dvh w-full bg-surface-950 flex overflow-hidden">
      <a href="#workspace-content" className="skip-link">
        Skip to content
      </a>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <Topbar />
        <ConnectionStatus />
        <main
          id="workspace-content"
          tabIndex={-1}
          className="workspace-main flex-1 min-w-0 min-h-0 overflow-y-auto"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
