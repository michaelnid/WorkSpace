import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function Layout() {
    return (
        <div className="app-layout">
            <Sidebar />
            <TopBar />
            <main className="app-content">
                <Outlet />
            </main>
        </div>
    );
}
