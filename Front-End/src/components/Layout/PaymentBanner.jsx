import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getBrokers } from '../../api/brokers';

export default function PaymentBanner() {
  const { user } = useAuth();
  const [hasPending, setHasPending] = useState(false);
  const [checked, setChecked] = useState(false);

  const today = new Date();
  const inWindow = today.getDate() >= 1 && today.getDate() <= 5;
  const roles = (user?.roles || []).map((r) => String(r).toLowerCase());
  const isAdmin = roles.includes('admin');
  const isRmOrJr = roles.some((r) => r === 'rm' || r === 'jrm' || r === 'jr' || r.includes('rm'));

  useEffect(() => {
    if (!user || !inWindow || !isAdmin) {
      setChecked(true);
      return;
    }
    let active = true;
    getBrokers()
      .then((res) => {
        if (!active) return;
        const list = res.data?.data || [];
        const pending = list.some((b) => Number(b.pending_payout || 0) > 0);
        setHasPending(pending);
      })
      .catch(() => { if (active) setHasPending(false); })
      .finally(() => { if (active) setChecked(true); });
    return () => { active = false; };
  }, [user, inWindow, isAdmin]);

  if (!user || !inWindow || !checked) return null;

  let message = '';
  let tone = '';
  if (isAdmin && hasPending) {
    message = 'It\u2019s Payment Time \u2014 broker payouts for this cycle are still pending. Please clear the dues by 5th of this month.';
    tone = 'banner--warn';
  } else if (isRmOrJr && !isAdmin) {
    message = 'Reminder: Please fill the data of all your brokers between the 1st to 5th of every month.';
    tone = 'banner--info';
  } else {
    return null;
  }

  return (
    <div className={`payment-banner ${tone}`}>
      <div className="payment-banner__track">
        <span className="payment-banner__text">{message}</span>
        <span className="payment-banner__text" aria-hidden="true">{message}</span>
        <span className="payment-banner__text" aria-hidden="true">{message}</span>
      </div>
    </div>
  );
}
