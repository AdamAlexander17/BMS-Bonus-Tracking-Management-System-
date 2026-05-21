import { createContext, useContext, useState, useEffect } from 'react';
import { login as loginApi, logout as logoutApi, changeOwnPassword as changeOwnPasswordApi } from '../api/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) setUser(JSON.parse(stored));
    setLoading(false);
  }, []);

  const login = async (username, password) => {
    const { data } = await loginApi({ username, password });
    const { access_token, refresh_token, user: userData } = data.data;
    localStorage.setItem('access_token', access_token);
    localStorage.setItem('refresh_token', refresh_token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
    return userData;
  };

  const changeOwnPassword = async (currentPassword, newPassword) => {
    const { data } = await changeOwnPasswordApi({
      current_password: currentPassword,
      new_password: newPassword,
    });
    const updatedUser = user ? { ...user, must_change_password: false } : null;
    if (updatedUser) {
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setUser(updatedUser);
    }
    return data;
  };

  const logout = async () => {
    const refresh = localStorage.getItem('refresh_token');
    try { await logoutApi(refresh); } catch { /* ignore */ }
    localStorage.clear();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, changeOwnPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
