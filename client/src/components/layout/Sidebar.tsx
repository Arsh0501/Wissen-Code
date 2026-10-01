import { NavLink } from 'react-router-dom';
import { Code2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getNavItemsForRole } from './navItems';
import styles from './Sidebar.module.css';

export default function Sidebar() {
  const { role } = useAuth();
  const items = getNavItemsForRole(role);

  return (
    <aside className={styles.primaryAside}>
      <div className={styles.codeBox}>
        <div className={styles.codeBox2}>
          <Code2 className={styles.codeIcon} />
        </div>
        <div>
          <h1 className={styles.wissenCodeTitle}>Wissen Code</h1>
          <p className={styles.assessmentPlatformText}>Assessment Platform</p>
        </div>
      </div>

      <nav aria-label="Primary" className={styles.primaryNav}>
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `${styles.label} ${isActive
                  ? styles.labelActive
                  : styles.labelInactive}`
            }
          >
            <Icon className={styles.icon} />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
