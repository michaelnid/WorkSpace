import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { GlobalSearch } from './GlobalSearch';
import { NotificationBell } from './NotificationBell';
import { useToast } from './ModalProvider';

export function TopBar() {
    const { user, switchTenant } = useAuth();
    const navigate = useNavigate();
    const toast = useToast();

    const handleTenantChange = async (tenantId: number) => {
        try {
            await switchTenant(tenantId);
            navigate('/');
        } catch (error) {
            console.error(error);
            toast.error('Mandantenwechsel fehlgeschlagen');
        }
    };

    return (
        <header className="topbar">
            <div className="topbar-spacer" />
            <div className="topbar-search">
                <GlobalSearch />
            </div>
            <div className="topbar-right">
                <NotificationBell />
                {user?.tenants && user.tenants.length > 1 && (
                    <select
                        className="topbar-tenant-select"
                        value={user.currentTenantId || ''}
                        onChange={(e) => handleTenantChange(Number(e.target.value))}
                        title="Mandant wechseln"
                    >
                        {user.tenants.map((tenant) => (
                            <option key={tenant.id} value={tenant.id}>
                                {tenant.name}
                            </option>
                        ))}
                    </select>
                )}
            </div>
        </header>
    );
}
