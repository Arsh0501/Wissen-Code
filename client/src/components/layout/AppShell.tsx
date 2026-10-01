import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import styles from './AppShell.module.css';

// Shared application shell: persistent side navigation + topbar wrapping every authenticated page.
export default function AppShell() {
  return (
    <div className={styles.box}>
      <Sidebar />
      <div className={styles.box2}>
        <Topbar />
        <main className={styles.main}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
