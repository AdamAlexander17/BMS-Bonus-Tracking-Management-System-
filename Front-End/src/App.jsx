import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import PrivateRoute from './routes/PrivateRoute';
import Layout from './components/Layout/Layout';
import Login     from './pages/Login';
import Dashboard from './pages/Dashboard';
import Users     from './pages/Users';
import Roles     from './pages/Roles';
import Brokers   from './pages/Brokers';
import BrokerForm   from './pages/BrokerForm';
import BrokerDetail from './pages/BrokerDetail';
import Brands    from './pages/Brands';
import Reports   from './pages/Reports';
import AuditLog  from './pages/AuditLog';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            path="/"
            element={
              <PrivateRoute>
                <Layout />
              </PrivateRoute>
            }
          >
            <Route index          element={<Dashboard />} />
            <Route path="users"   element={<Users />} />
            <Route path="roles"   element={<Roles />} />
            <Route path="brokers"          element={<Brokers />} />
            <Route path="brokers/new"      element={<BrokerForm />} />
            <Route path="brokers/:id"      element={<BrokerDetail />} />
            <Route path="brokers/:id/edit" element={<BrokerForm />} />
            <Route path="brands"  element={<Brands />} />
            <Route path="reports" element={<Reports />} />
            <Route path="audit"   element={<AuditLog />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
