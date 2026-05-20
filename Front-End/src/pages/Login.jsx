import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Login.css';

export default function Login() {
  const { login } = useAuth();
  const navigate  = useNavigate();
  const [form, setForm]       = useState({ username: '', password: '' });
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form.username, form.password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lp">
      {/* Left: form panel */}
      <div className="lp__right">
        <div className="lp__form-wrap">
          <h2 className="lp__title">Login to Your Account</h2>
          <p className="lp__subtitle">Please enter your username and password to access your account</p>

          {error && <div className="lp__error">{error}</div>}

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
