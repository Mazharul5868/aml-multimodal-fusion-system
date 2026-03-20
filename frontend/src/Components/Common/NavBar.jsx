import { Link, useLocation } from 'react-router-dom';
import './NavBar.css';

const Navbar = () => {
  const location = useLocation();

  const navItems = [
    { path: '/', label: 'Home', icon: '🏠' },
    { path: '/patients', label: 'Patients', icon: '👥' },
    { path: '/analysis', label: 'Analysis', icon: '📊' },
    { path: '/labels', label: 'Labels', icon: '🏷️' },
  ];

  return (
    <nav className="navbar">
      <div className="navbar-container">

        <Link to="/" className="navbar-brand">
          <span className="brand-icon">🔬</span>
          <span className="brand-text">AML Diagnostic System</span>
          <span className="brand-text-short">AML</span>
        </Link>

        <ul className="navbar-menu">
          {navItems.map((item) => (
            <li key={item.path}>
              <Link
                to={item.path}
                className={`nav-link ${location.pathname === item.path ? 'active' : ''}`}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="navbar-user">
          <span className="user-name">Clinical User</span>
          <div className="user-avatar">CU</div>
        </div>

      </div>
    </nav>
  );
};

export default Navbar;