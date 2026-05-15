// AuthContext
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';

// ── AUTH CONTEXT ──────────────────────────────────────────
const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('fb_token');
    if (token) {
      api.me().then(u => setUser(u)).catch(() => localStorage.removeItem('fb_token')).finally(() => setLoading(false));
    } else { setLoading(false); }
  }, []);

  const login = async (email, password) => {
    const data = await api.login(email, password);
    localStorage.setItem('fb_token', data.token);
    setUser(data.user);
    return data.user;
  };
  const logout  = () => { localStorage.removeItem('fb_token'); setUser(null); };
  const hasRole = (...roles) => roles.flat().includes(user?.role);
  const isVendor  = () => user?.role === 'vendor_user';
  const canApprove = () => hasRole('procurement_manager','finance_team','super_admin');

  return (
    <AuthCtx.Provider value={{ user, loading, login, logout, hasRole, isVendor, canApprove }}>
      {children}
    </AuthCtx.Provider>
  );
}
export const useAuth = () => useContext(AuthCtx);

// ── TOAST CONTEXT ─────────────────────────────────────────
const ToastCtx = createContext(null);
let toastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const toast = useCallback((msg, type = 'success') => {
    const id = ++toastId;
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  }, []);
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>
            <span>{t.type === 'success' ? '✓' : '⚠'}</span>
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);
