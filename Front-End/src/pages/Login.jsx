import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Login.css';

const PASSWORD_RULE_MESSAGE = 'Password must be at least 8 characters and include 1 uppercase letter, 1 number, and 1 symbol.';

function getPasswordValidationMessage(password) {
  if (password.length < 8) return PASSWORD_RULE_MESSAGE;
  if (!/[A-Z]/.test(password)) return PASSWORD_RULE_MESSAGE;
  if (!/\d/.test(password)) return PASSWORD_RULE_MESSAGE;
  if (!/[^A-Za-z0-9]/.test(password)) return PASSWORD_RULE_MESSAGE;
  return '';
}

export default function Login() {
  const { user, login, changeOwnPassword, logout } = useAuth();
  const navigate  = useNavigate();
  const [form, setForm]       = useState({ username: '', password: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [showPwd, setShowPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user && !user.must_change_password) {
      navigate('/');
    }
  }, [navigate, user]);

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const userData = await login(form.username, form.password);
      if (!userData.must_change_password) {
        navigate('/');
      } else {
        setPasswordForm((prev) => ({ ...prev, currentPassword: form.password }));
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setError('');
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      setError('All password fields are required.');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('New password and confirm password must match.');
      return;
    }
    const passwordValidationMessage = getPasswordValidationMessage(passwordForm.newPassword);
    if (passwordValidationMessage) {
      setError(passwordValidationMessage);
      return;
    }
    setLoading(true);
    try {
      await changeOwnPassword(passwordForm.currentPassword, passwordForm.newPassword);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to change password.');
    } finally {
      setLoading(false);
    }
  };

  const forcedPasswordChange = Boolean(user?.must_change_password);

  return (
    <div className="lp">
      {/* Left: form panel */}
      <div className="lp__right">
        <div className="lp__form-wrap">
          <h2 className="lp__title">{forcedPasswordChange ? 'Change Your Password' : 'Login to Your Account'}</h2>
          <p className="lp__subtitle">
            {forcedPasswordChange
              ? 'Your first login uses the default password 123456. Set a new password before continuing.'
              : 'Please enter your username and password to access your account'}
          </p>
          {forcedPasswordChange ? <p className="lp__helper">Use at least 8 characters with 1 uppercase letter, 1 number, and 1 symbol.</p> : null}

          {error && <div className="lp__error">{error}</div>}

          {forcedPasswordChange ? (
            <form onSubmit={handlePasswordChange} className="lp__form">
              <div className="lp__notice">Password change is required before you can access the application.</div>
              <div className="lp__field">
                <label>Current Password <span className="lp__req">*</span></label>
                <div className="lp__pwd-wrap">
                  <input
                    name="currentPassword"
                    type={showPwd ? 'text' : 'password'}
                    placeholder="Enter current password"
                    value={passwordForm.currentPassword}
                    onChange={(e) => setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
                    required
                    autoFocus
                  />
                  <button type="button" className="lp__show-btn" onClick={() => setShowPwd((p) => !p)}>
                    {showPwd ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
              <div className="lp__field">
                <label>New Password <span className="lp__req">*</span></label>
                <div className="lp__pwd-wrap">
                  <input
                    name="newPassword"
                    type={showNewPwd ? 'text' : 'password'}
                    placeholder="Enter new password"
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
                    required
                  />
                  <button type="button" className="lp__show-btn" onClick={() => setShowNewPwd((p) => !p)}>
                    {showNewPwd ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
              <div className="lp__field">
                <label>Confirm Password <span className="lp__req">*</span></label>
                <div className="lp__pwd-wrap">
                  <input
                    name="confirmPassword"
                    type={showConfirmPwd ? 'text' : 'password'}
                    placeholder="Confirm new password"
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                    required
                  />
                  <button type="button" className="lp__show-btn" onClick={() => setShowConfirmPwd((p) => !p)}>
                    {showConfirmPwd ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
              <div className="lp__actions">
                <button type="button" className="lp__secondary" onClick={logout} disabled={loading}>Logout</button>
                <button type="submit" className="lp__submit" disabled={loading}>
                  {loading ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="lp__form">
              <div className="lp__field">
                <label>Username <span className="lp__req">*</span></label>
                <input
                  name="username"
                  type="text"
                  placeholder="Enter username"
                  value={form.username}
                  onChange={handleChange}
                  required
                  autoFocus
                />
              </div>

              <div className="lp__field">
                <label>Password <span className="lp__req">*</span></label>
                <div className="lp__pwd-wrap">
                  <input
                    name="password"
                    type={showPwd ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={form.password}
                    onChange={handleChange}
                    required
                  />
                  <button type="button" className="lp__show-btn" onClick={() => setShowPwd(p => !p)}>
                    {showPwd ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <button type="submit" className="lp__submit" disabled={loading}>
                {loading ? 'Logging in...' : 'Login'}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Right: decorative teal panel */}
      <div className="lp__left">
        {/* Brand */}
        <div className="lp__brand">
          <div className="lp__brand-icon">
            <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" width="26" height="26">
              <rect x="4"  y="26" width="7" height="10" rx="2" fill="#fff" opacity="0.9"/>
              <rect x="14" y="18" width="7" height="18" rx="2" fill="#fff" opacity="0.9"/>
              <rect x="24" y="10" width="7" height="26" rx="2" fill="#fff" opacity="0.9"/>
              <polyline points="5,28 17,20 27,12" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" fill="none" strokeDasharray="3 2"/>
            </svg>
          </div>
          <div className="lp__brand-text">
            <span className="lp__brand-name">BMS</span>
            <span className="lp__brand-tagline">Bonus Tracking Management</span>
          </div>
        </div>

        {/* Content */}
        <div className="lp__left-content">
          <p className="lp__headline">Smarter Bonus<br/>Management Starts Here</p>
          <p className="lp__desc">
            Track broker commissions, manage client payouts, and monitor
            performance — all from one powerful, unified platform.
          </p>
          <div className="lp__features">
            <div className="lp__feature">
              <span className="lp__feature-dot" />
              <span>Real-time commission &amp; bonus tracking</span>
            </div>
            <div className="lp__feature">
              <span className="lp__feature-dot" />
              <span>Multi-brand client payout management</span>
            </div>
            <div className="lp__feature">
              <span className="lp__feature-dot" />
              <span>Role-based access with full audit trail</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="lp__left-footer">
          <span>&copy; 2026 BMS &mdash; Bonus Tracking Management System</span>
        </div>
      </div>
    </div>
  );
}
