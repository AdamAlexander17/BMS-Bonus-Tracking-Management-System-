import { useEffect } from 'react';

const TYPES = {
  error:   { border: '#dc2626', iconBg: 'rgba(220,38,38,0.1)',   icon: '#dc2626', label: 'Action Failed' },
  success: { border: '#16a34a', iconBg: 'rgba(22,163,74,0.1)',   icon: '#16a34a', label: 'Success' },
  info:    { border: '#004B4E', iconBg: 'rgba(0,75,78,0.1)',     icon: '#004B4E', label: 'Notice' },
};

export default function Toast({ message, type = 'error', onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4500);
    return () => clearTimeout(t);
  }, [message, onClose]);

  const c = TYPES[type] || TYPES.error;

  return (
    <>
      <style>{`
        @keyframes toast-slide-in {
          from { transform: translateX(60px); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
      <div style={{
        position: 'fixed', top: 24, right: 24, zIndex: 3000,
        background: '#fff',
        borderRadius: 12,
        borderLeft: `4px solid ${c.border}`,
        boxShadow: '0 8px 28px rgba(0,0,0,0.12)',
        padding: '14px 16px 14px 14px',
        display: 'flex', alignItems: 'flex-start', gap: 12,
        maxWidth: 340, minWidth: 260,
        animation: 'toast-slide-in 0.22s ease',
      }}>
        {/* Icon */}
        <div style={{
          width: 34, height: 34, borderRadius: '50%',
          background: c.iconBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke={c.icon} strokeWidth="2.3"
               strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#111827', lineHeight: 1.3 }}>
            {c.label}
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6b7280', lineHeight: 1.45 }}>
            {message}
          </p>
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#9ca3af', fontSize: 18, lineHeight: 1, padding: '0 0 0 4px',
            flexShrink: 0,
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#374151'}
          onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}
        >×</button>
      </div>
    </>
  );
}
