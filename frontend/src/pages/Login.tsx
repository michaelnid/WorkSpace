import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

type LoginStep = 'credentials' | 'mfa';

export function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [mfaCode, setMfaCode] = useState('');
    const [step, setStep] = useState<LoginStep>('credentials');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const result = await login(
                username,
                password,
                step === 'mfa' ? { mfaCode } : undefined
            );

            if (result.mfaRequired) {
                setStep('mfa');
                setLoading(false);
                return;
            }

            navigate('/');
        } catch (err: any) {
            setError(err.message || 'Login fehlgeschlagen');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-card">
                <h2 className="login-title">MIKE</h2>
                <p className="login-subtitle">WorkSpace</p>

                {error && <div className="login-error">{error}</div>}

                <form onSubmit={handleSubmit}>
                    {step === 'credentials' ? (
                        <>
                            <div className="form-group">
                                <label className="form-label" htmlFor="username">Benutzername</label>
                                <input
                                    id="username"
                                    className="form-input"
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    autoComplete="username"
                                    autoFocus
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label" htmlFor="password">Passwort</label>
                                <input
                                    id="password"
                                    className="form-input"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    autoComplete="current-password"
                                    required
                                />
                            </div>
                        </>
                    ) : (
                        <div className="form-group">
                            <label className="form-label" htmlFor="mfaCode">Authenticator- oder Recovery-Code</label>
                            <input
                                id="mfaCode"
                                className="form-input"
                                type="text"
                                value={mfaCode}
                                onChange={(e) => setMfaCode(e.target.value.toUpperCase())}
                                placeholder="Code eingeben"
                                autoFocus
                                required
                            />
                            <p className="text-muted" style={{ marginTop: 'var(--space-xs)', fontSize: 'var(--font-size-xs)' }}>
                                6-stelliger Authenticator-Code oder 8-stelliger Recovery-Code
                            </p>
                        </div>
                    )}

                    <button
                        type="submit"
                        className="btn btn-primary login-btn"
                        disabled={loading}
                    >
                        {loading ? 'Anmelden...' : step === 'credentials' ? 'Anmelden' : 'Verifizieren'}
                    </button>
                </form>
            </div>
        </div>
    );
}
