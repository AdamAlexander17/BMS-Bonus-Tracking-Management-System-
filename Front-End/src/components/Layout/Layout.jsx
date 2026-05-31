import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import PaymentBanner from './PaymentBanner';
import './Layout.css';

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="layout">
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      <div className="layout__main layout__main--with-top-margin">
        <PaymentBanner />
        <main className="layout__content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
