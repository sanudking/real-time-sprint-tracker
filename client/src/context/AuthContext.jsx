import { createContext, useContext, useMemo, useState } from 'react';
import api from '../api/axios';
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => { try { return JSON.parse(localStorage.getItem('sprint_user')); } catch { return null; } });
  const [token, setToken] = useState(() => localStorage.getItem('sprint_token'));
  const authenticate = async (path, payload) => {
    const { data } = await api.post(`/api/auth/${path}`, payload);
    localStorage.setItem('sprint_token', data.token);
    localStorage.setItem('sprint_user', JSON.stringify(data.user));
    setToken(data.token); setUser(data.user);
  };
  const login = (payload) => authenticate('login', payload);
  const register = (payload) => authenticate('register', payload);
  const logout = () => { localStorage.removeItem('sprint_token'); localStorage.removeItem('sprint_user'); setToken(null); setUser(null); };
  const value = useMemo(() => ({ user, token, login, register, logout }), [user, token]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
