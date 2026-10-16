import React, { useEffect, useState } from 'react';
import { api } from '../api';
import {
  AlertCircle,
  ArrowRight,
  ChefHat,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  Package,
  ShoppingCart,
} from 'lucide-react';

interface LoginProps {
  onLoginSuccess: (token: string, restaurantName: string) => void;
}

// Key used to remember the last email when "Remember me" is ticked.
// Only the email is stored — never the password.
const REMEMBER_KEY = 'rememberedEmail';

export default function Login({ onLoginSuccess }: LoginProps) {
  const [email, setEmail] = useState(() => localStorage.getItem(REMEMBER_KEY) || '');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(() => !!localStorage.getItem(REMEMBER_KEY));
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Live clock for the "kitchen ticket" on the left panel.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsLoggingIn(true);

    try {
      const res = await api.post('/auth/login', { email: email.trim(), password });
      const jwtToken = res.data.token || res.data.accessToken;
      const restName = res.data.restaurantName || res.data.user?.restaurantName || 'My Restaurant';

      if (!jwtToken) {
        setAuthError('The server did not return a login token. Please try again.');
        return;
      }

      // Remember (or forget) the email for next time.
      if (rememberMe) localStorage.setItem(REMEMBER_KEY, email.trim());
      else localStorage.removeItem(REMEMBER_KEY);

      localStorage.setItem('token', jwtToken);
      localStorage.setItem('restaurantName', restName);
      onLoginSuccess(jwtToken, restName);
    } catch (err: any) {
      // The server sends its reason in `error` (e.g. "Invalid email or password.").
      // No response at all means the API server is not running / not reachable.
      if (!err.response) {
        setAuthError('Cannot reach the server. Check that the API is running.');
      } else {
        setAuthError(err.response.data?.error || err.response.data?.message || 'Login failed. Please try again.');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Warn when Caps Lock is on while typing the password (a very common login mistake).
  const checkCapsLock = (e: React.KeyboardEvent<HTMLInputElement>) => {
    setCapsLockOn(e.getModifierState?.('CapsLock') ?? false);
  };

  const timeText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateText = now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="min-h-screen w-full flex bg-[#fbf5e8]">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap');
        .ticket-font { font-family: 'Bebas Neue', 'Arial Narrow', sans-serif; letter-spacing: 0.05em; }

        /* Soft entrance animation for the panels */
        @keyframes login-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        .login-rise { animation: login-rise 0.6s cubic-bezier(.2,.7,.2,1) both; }

        /* Dotted "kitchen board" texture on the dark panel */
        .login-dots { background-image: radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px); background-size: 18px 18px; }

        /* Torn-paper bottom edge of the receipt */
        .login-receipt-edge {
          height: 10px;
          background: linear-gradient(-45deg, transparent 5px, #fffdf8 0) 0 0 / 10px 10px repeat-x,
                      linear-gradient(45deg, transparent 5px, #fffdf8 0) 0 0 / 10px 10px repeat-x;
        }
      `}</style>

      {/* ───────── Left: brand panel (hidden on small screens) ───────── */}
      <aside className="hidden lg:flex relative w-[46%] max-w-[640px] flex-col justify-between overflow-hidden bg-[#1c1917] text-slate-300 p-12 login-dots">
        {/* Warm glow behind the content */}
        <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-[#c2621f]/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-[#8a3f16]/25 blur-3xl" />

        {/* Brand */}
        <div className="relative flex items-center gap-3 login-rise">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#8a3f16] to-[#c2621f] text-lg shadow-lg shadow-[#c2621f]/20">
            🍽️
          </span>
          <div>
            <p className="ticket-font text-2xl text-white leading-none">POS Center</p>
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 mt-1">Restaurant Suite</p>
          </div>
        </div>

        {/* Headline + kitchen ticket */}
        <div className="relative login-rise" style={{ animationDelay: '0.1s' }}>
          <h2 className="ticket-font text-6xl xl:text-7xl text-white leading-[0.9]">
            Every order.
            <br />
            <span className="text-[#c2621f]">On time.</span>
          </h2>
          <p className="mt-5 max-w-sm text-sm text-slate-400 leading-relaxed">
            Take orders, fire them to the kitchen and keep your stock in check, all from one place.
          </p>

          {/* Decorative receipt with a live clock */}
          <div className="mt-10 w-72 rotate-[-2deg] drop-shadow-2xl">
            <div className="bg-[#fffdf8] rounded-t-md px-5 pt-4 pb-3 text-[#221F1C]">
              <div className="flex items-center justify-between border-b border-dashed border-[#E7E1D2] pb-2">
                <span className="ticket-font text-lg">Shift Open</span>
                <span className="text-[10px] font-mono text-[#8a8377]">#0001</span>
              </div>
              <p className="ticket-font text-5xl mt-3 leading-none tabular-nums">{timeText}</p>
              <p className="text-[11px] text-[#8a8377] mt-1 capitalize">{dateText}</p>
              <div className="mt-3 space-y-1.5 border-t border-dashed border-[#E7E1D2] pt-3 text-xs">
                <TicketLine icon={<ShoppingCart className="h-3.5 w-3.5" />} label="POS Terminal" />
                <TicketLine icon={<ChefHat className="h-3.5 w-3.5" />} label="Kitchen Display" />
                <TicketLine icon={<Package className="h-3.5 w-3.5" />} label="Stock & Purchases" />
              </div>
            </div>
            <div className="login-receipt-edge" />
          </div>
        </div>

        <p className="relative text-[11px] text-slate-600">© {now.getFullYear()} POS Center</p>
      </aside>

      {/* ───────── Right: sign-in form ───────── */}
      <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm login-rise" style={{ animationDelay: '0.15s' }}>
          {/* Compact brand for small screens (the left panel is hidden there) */}
          <div className="lg:hidden mb-8 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#8a3f16] to-[#c2621f] text-lg">
              🍽️
            </span>
            <p className="ticket-font text-2xl text-[#1c1917] leading-none">POS Center</p>
          </div>

          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#c2621f]">Welcome back</p>
          <h1 className="ticket-font text-4xl text-[#1c1917] mt-1">Sign in to your restaurant</h1>
          <p className="text-sm text-[#8a8377] mt-1">Enter your staff account to continue.</p>

          {authError && (
            <div
              role="alert"
              className="mt-6 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            {/* Email */}
            <div>
              <label htmlFor="login-email" className="mb-1.5 block text-xs font-semibold text-[#221F1C]">
                Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a8377]" />
                <input
                  id="login-email"
                  type="email"
                  required
                  autoFocus={!email}
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@restaurant.com"
                  className="w-full rounded-xl border border-[#E7E1D2] bg-white py-3 pl-10 pr-4 text-sm text-[#221F1C] placeholder:text-[#b9b2a4] shadow-sm transition focus:border-[#c2621f] focus:outline-none focus:ring-4 focus:ring-[#c2621f]/15"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="login-password" className="mb-1.5 block text-xs font-semibold text-[#221F1C]">
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a8377]" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoFocus={!!email}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyUp={checkCapsLock}
                  onKeyDown={checkCapsLock}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-[#E7E1D2] bg-white py-3 pl-10 pr-11 text-sm text-[#221F1C] placeholder:text-[#b9b2a4] shadow-sm transition focus:border-[#c2621f] focus:outline-none focus:ring-4 focus:ring-[#c2621f]/15"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-[#8a8377] transition hover:bg-[#F1ECDC] hover:text-[#221F1C]"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {capsLockOn && (
                <p className="mt-1.5 text-[11px] font-medium text-[#b5541f]">Caps Lock is on</p>
              )}
            </div>

            {/* Remember me */}
            <label className="flex cursor-pointer items-center gap-2 select-none text-xs text-[#5c564c]">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-[#E7E1D2] accent-[#c2621f]"
              />
              Remember my email on this device
            </label>

            {/* Submit — same orange gradient as the SAVE buttons in the app */}
            <button
              type="submit"
              disabled={isLoggingIn}
              className="group mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#8a3f16] to-[#c2621f] py-3 text-sm font-bold uppercase tracking-wider text-white shadow-lg shadow-[#c2621f]/25 transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoggingIn ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-[11px] text-[#8a8377]">
            Forgot your password? Ask your restaurant manager to reset it.
          </p>
        </div>
      </main>
    </div>
  );
}

// One line of the decorative receipt: icon, label, and a "ready" tick.
function TicketLine({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 text-[#221F1C]">
      <span className="text-[#c2621f]">{icon}</span>
      <span className="flex-1">{label}</span>
      <span className="text-[10px] font-semibold text-[#4C7A5E]">READY</span>
    </div>
  );
}
