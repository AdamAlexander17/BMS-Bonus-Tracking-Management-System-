import { createContext, useContext, useState, useEffect } from 'react';
import {
  login as loginApi,
  logout as logoutApi,
  changeOwnPassword as changeOwnPasswordApi,
  fetchMe,
} from '../api/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]   = useState(null);
  const [loading, setLoading] = useState(true);

  // On app boot: hydrate from localStorage immediately for snappy UI,
  // then re-fetch from the server so role/permission/brand changes the
  // admin made since this user's JWT was minted are picked up without
  // forcing a logout. If the token is no longer valid, clear session.
  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) setUser(JSON.parse(stored));

    const token = localStorage.getItem('access_token');
    if (!token) {
      setLoading(false);
      return;
    }

    fetchMe()
      .then(({ data }) => {
        const fresh = data?.data;
        if (fresh) {
          localStorage.setItem('user', JSON.stringify(fresh));
          setUser(fresh);
        }
      })
      .catch(() => { /* axios interceptor handles 401 refresh/logout */ })
      .finally(() => setLoading(false));
  }, []);

  const refreshUser = async () => {
    try {
      const { data } = await fetchMe();
      const fresh = data?.data;
      if (fresh) {
        localStorage.setItem('user', JSON.stringify(fresh));
        setUser(fresh);
      }
      return fresh;
    } catch {
      return null;
    }
  };

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
    <AuthContext.Provider value={{ user, login, logout, loading, changeOwnPassword, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
