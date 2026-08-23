import React, { useState } from 'react';
import { api } from '../api';
import { Layers, AlertCircle, Lock, Mail } from 'lucide-react';

interface LoginProps {
  onLoginSuccess: (token: string, restaurantName: string) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsLoggingIn(true);

    try {
      const res = await api.post('/auth/login', { email, password });
      console.log('Login API Response Data:', res.data); // 👈 Open F12 Browser Console to inspect this
      const jwtToken = res.data.token || res.data.accessToken;
// Extract restaurant name from response (fallback to a default if null)
const restName = res.data.restaurantName || res.data.user?.restaurantName || 'Restaurant Depot';

if (jwtToken) {
  localStorage.setItem('token', jwtToken);
  localStorage.setItem('restaurantName', restName); // 👈 Store locally
  onLoginSuccess(jwtToken, restName);
} else {
        setAuthError('Token missing in server response.');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      const serverMessage = err.response?.data?.message || err.message;
      setAuthError(`Login Failed: ${serverMessage}`);
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-8">
        <div className="flex items-center gap-3 mb-6 justify-center">
          <div className="bg-indigo-600 text-white p-2.5 rounded-xl shadow-md">
            <Layers size={24} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">POS Admin</h1>
        </div>

        <p className="text-sm text-slate-500 text-center mb-6">
          Sign in to manage your restaurant menu & categories.
        </p>

        {authError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-600 text-xs font-medium">
            <AlertCircle size={16} className="shrink-0" />
            <span>{authError}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Email Address
            </label>
            <div className="relative">
              <Mail size={18} className="absolute left-3 top-3 text-slate-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@restaurant.com"
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-3 text-slate-400" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoggingIn}
            className="w-full mt-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 rounded-xl transition shadow-md disabled:opacity-50"
          >
            {isLoggingIn ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}