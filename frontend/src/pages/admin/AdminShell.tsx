import { Link, Outlet, useLocation } from 'react-router-dom';

export default function AdminShell() {
    const location = useLocation();
    const isAdminHome = location.pathname === '/admin' || location.pathname === '/admin/';

    return (
        <div>
            {!isAdminHome && (
                <div className="admin-shell-back-nav">
                    <Link to="/admin" className="btn btn-secondary btn-sm admin-shell-back-link">
                        <svg
                            className="admin-shell-back-icon"
                            viewBox="0 0 20 20"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            aria-hidden="true"
                        >
                            <path
                                d="M11.5 5L6.5 10L11.5 15"
                                stroke="currentColor"
                                strokeWidth="1.75"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                        Zurück
                    </Link>
                </div>
            )}
            <Outlet />
        </div>
    );
}
