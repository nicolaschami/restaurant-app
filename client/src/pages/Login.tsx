import React, { useEffect, useState } from 'react';
import { api } from '../api';
import TerminalPinPad from '../components/TerminalPinPad';
import { saveTerminal, terminalKey } from '../lib/terminal';
import { setMe } from '../lib/session';
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2, Lock, User } from 'lucide-react';

// Look (chosen by the user 2026-10-30, option B "Night service"): a dark green screen
// with a soft gold glow and ONE centered card — the gold RES logo, a greeting that
// follows the time of day, the form and a gold Sign in button. Same colours as the POS
// (#131c18 green, #c9a24b gold), so login, PIN pad and POS look like one product.

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
  // A registered POS terminal opens on the PIN pad (lib/terminal.ts).
  const [usePinPad, setUsePinPad] = useState(() => Boolean(terminalKey()));
  // "This PC is a POS terminal": registered right after a successful email login
  // (owner or manager only — the server refuses it for a cashier).
  const [registerTerminal, setRegisterTerminal] = useState(false);

  // The greeting follows the time of day (checked every minute).
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
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
      setMe(res.data.user);

      // Register this PC as a POS terminal: it keeps the secret key, and from now on
      // the login page shows the PIN pad for this restaurant.
      if (registerTerminal) {
        try {
          const t = await api.post('/terminals', { name: 'POS terminal' });
          saveTerminal(t.data.key, t.data.restaurantName || restName);
        } catch (err: any) {
          setAuthError(err?.response?.data?.error || 'This PC could not be registered as a POS terminal.');
          return;
        }
      }
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

  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  // the dark fields of the card (same look for username and password)
  const field =
    'w-full rounded-[10px] border border-[#2f3d36] bg-[#0f1713] py-3 pl-10 text-[15px] text-white placeholder:text-[#5f6c65] transition focus:border-[#c9a24b] focus:outline-none focus:ring-4 focus:ring-[#c9a24b]/15';
  const fieldLabel = 'mb-1.5 block text-xs font-semibold uppercase tracking-[0.06em] text-[#c9a24b]';

  if (usePinPad && terminalKey()) {
    return (
      <TerminalPinPad
        onLoggedIn={(jwt, user) => {
          localStorage.setItem('token', jwt);
          localStorage.setItem('restaurantName', user?.restaurantName || '');
          setMe(user);
          onLoginSuccess(jwt, user?.restaurantName || '');
        }}
        onUseEmail={() => setUsePinPad(false)}
      />
    );
  }

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#0e1512] px-4 py-10 font-sans text-[#e9e4d6]">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&display=swap');
        .login-serif { font-family: 'Fraunces', Georgia, serif; }
        /* soft entrance of the card */
        @keyframes login-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        .login-rise { animation: login-rise 0.6s cubic-bezier(.2,.7,.2,1) both; }
      `}</style>

      {/* soft gold glow at the top, green glow at the bottom (decoration only) */}
      <div aria-hidden="true" className="pointer-events-none absolute -top-56 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-[#c9a24b]/10 blur-[60px]" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-52 -left-32 h-[460px] w-[460px] rounded-full bg-[#2e5e48]/35 blur-[70px]" />

      <div className="login-rise relative w-full max-w-[440px] rounded-[20px] border border-[#c9a24b]/25 bg-[#17211c] px-6 pb-8 pt-10 shadow-[0_24px_60px_rgba(0,0,0,0.45)] sm:px-10">
        {/* logo + greeting */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="login-serif flex h-16 w-16 items-center justify-center rounded-[18px] bg-[#c9a24b] text-[22px] font-bold text-[#131c18]">RES</div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8f9a93]">RES POS</div>
          <h1 className="login-serif text-3xl font-medium text-white">{greeting}</h1>
          <p className="text-sm text-[#a9b3ad]">Sign in to start the service</p>
        </div>

        {authError && (
          <div role="alert" className="mt-6 flex items-start gap-2 rounded-[10px] border border-red-500/40 bg-red-500/10 p-3 text-xs font-medium text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{authError}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="mt-6 space-y-5">
          {/* Username: "sara@capri" (the part after @ = the restaurant, 2026-10-28)
              or an email for older accounts — so a text box, not type="email" */}
          <div>
            <label htmlFor="login-email" className={fieldLabel}>
              Username
            </label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6f7b74]" />
              <input
                id="login-email"
                type="text"
                autoCapitalize="none"
                spellCheck={false}
                required
                autoFocus={!email}
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. sara@capri"
                className={`${field} pr-4`}
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label htmlFor="login-password" className={fieldLabel}>
              Password
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6f7b74]" />
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
                className={`${field} pr-11`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-[#8f9a93] transition hover:bg-white/5 hover:text-white"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {capsLockOn && <p className="mt-1.5 text-[11px] font-medium text-[#e2c27a]">Caps Lock is on</p>}
          </div>

          {/* Remember me */}
          <label className="flex cursor-pointer select-none items-center gap-2 text-[13px] text-[#c3ccc6]">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 rounded accent-[#c9a24b]"
            />
            Remember my username on this device
          </label>

          {/* POS terminal: cashiers will log in here with their PIN only */}
          <label className="flex cursor-pointer select-none items-start gap-2 text-[13px] text-[#c3ccc6]">
            <input
              type="checkbox"
              checked={registerTerminal}
              onChange={(e) => setRegisterTerminal(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded accent-[#c9a24b]"
            />
            <span>
              This PC is a <b className="text-white">POS terminal</b>: cashiers log in here with their 4-digit PIN
              <span className="block text-[11px] text-[#8f9a93]">Owner or manager login. Done once per PC.</span>
            </span>
          </label>
          {terminalKey() && (
            <button type="button" onClick={() => setUsePinPad(true)} className="text-xs font-semibold text-[#c9a24b] hover:underline">
              ← Back to the PIN pad
            </button>
          )}

          {/* Sign in — the gold button */}
          <button
            type="submit"
            disabled={isLoggingIn}
            className="group flex h-[52px] w-full items-center justify-center gap-2 rounded-[10px] bg-[#c9a24b] text-[15px] font-bold tracking-wide text-[#131c18] transition hover:bg-[#d8b465] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
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

        <p className="mt-6 text-center text-xs text-[#8f9a93]">Forgot your password? Ask your restaurant manager to reset it.</p>
      </div>

      <p className="absolute bottom-5 left-0 right-0 text-center text-xs text-[#6f7b74]">RES POS · Restaurant suite</p>
    </div>
  );
}
