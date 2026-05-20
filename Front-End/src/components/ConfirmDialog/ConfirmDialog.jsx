export default function ConfirmDialog({
  title,
  itemName,
  bullets,
  onConfirm,
  onCancel,
  confirmLabel = 'Delete',
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: 'rgba(0,0,0,0.18)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 14, width: '100%', maxWidth: 340,
        boxShadow: '0 8px 32px rgba(0,0,0,0.14)', overflow: 'hidden',
      }}>
        {/* Body */}
        <div style={{ padding: '20px 18px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>

            {/* Large solid red circle icon */}
            <div style={{
              width: 42, height: 42, borderRadius: '50%',
              background: '#dc2626',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" width="19" height="19">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6M14 11v6"/>
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 style={{ margin: '0 0 5px', fontSize: '0.87rem', fontWeight: 700, color: '#111827' }}>
                {title}
              </h3>

              {itemName && (
                <p style={{ margin: '0 0 7px', fontSize: 11.5, color: '#4b5563', lineHeight: 1.5 }}>
                  <span style={{
                    background: '#f1f5f9', borderRadius: 5, padding: '1px 7px',
                    fontWeight: 600, color: '#111827', fontFamily: 'monospace', fontSize: 12,
                  }}>
                    {itemName}
                  </span>
                  {' '}will be permanently removed.
                </p>
              )}

              {bullets && bullets.length > 0 && (
                <>
                  <p style={{ margin: '0 0 5px', fontSize: 11, color: '#374151', fontWeight: 600 }}>
                    You'll permanently lose:
                  </p>
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {bullets.map((b, i) => (
                      <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: '#6b7280' }}>
                        <span style={{
                          width: 5, height: 5, borderRadius: '50%',
                          background: '#dc2626', flexShrink: 0, opacity: 0.7,
                        }}/>
                        {b}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
          padding: '10px 18px', borderTop: '1px solid #f1f5f9',
        }}>
          <button className="ph-btn ph-btn--ghost" style={{ height: 'auto', padding: '7px 16px', fontSize: 13 }} onClick={onCancel}>Cancel</button>
          <button
            style={{
              background: '#dc2626', color: '#fff', border: 'none',
              borderRadius: 8, padding: '7px 16px', fontSize: 13,
              fontWeight: 700, cursor: 'pointer', transition: 'background 0.15s',
              letterSpacing: '0.01em',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#b91c1c'}
            onMouseLeave={e => e.currentTarget.style.background = '#dc2626'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
