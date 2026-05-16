import { useState, useRef, useEffect } from 'react';
import './CustomSelect.css';

export default function CustomSelect({ value, onChange, options, placeholder = 'All Roles' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const selected = options.find(o => o.value === value);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="csel" ref={ref}>
      <button
        type="button"
        className="csel__trigger"
        onClick={() => setOpen(o => !o)}
      >
        <span>{selected ? selected.label : placeholder}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="13" height="13">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <ul className="csel__dropdown">
          {options.map(opt => (
            <li
              key={opt.value}
              className={`csel__option ${opt.value === value ? 'csel__option--active' : ''}`}
              onClick={() => { onChange(opt.value === value ? 'all' : opt.value); setOpen(false); }}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
