import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Layers3 } from 'lucide-react';
export default function AuthPage({ mode }) {
  const isRegister = mode === 'register'; const { token, login, register } = useAuth(); const navigate = useNavigate();
  const [params] = useSearchParams(); const expired = params.get('expired') === '1';
  const [form, setForm] = useState({ name: '', email: '', password: '' }); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  if (token) return <Navigate to="/workspaces" replace/>;
  const change = e => setForm({ ...form, [e.target.name]: e.target.value });
  const submit = async e => { e.preventDefault(); setError(''); setBusy(true); try { await (isRegister ? register(form) : login({ email: form.email, password: form.password })); navigate('/workspaces'); } catch (err) { setError(err.response?.data?.message || 'Something went wrong'); } finally { setBusy(false); } };
  return <main className="grid min-h-screen place-items-center px-4"><div className="w-full max-w-sm">
    <div className="mb-8 flex items-center justify-center gap-2"><div className="rounded-lg bg-violet-500/15 p-2 text-violet-300"><Layers3 size={22}/></div><span className="text-lg font-bold tracking-tight">sprint<span className="text-violet-400">board</span></span></div>
    <div className="rounded-2xl border border-line bg-panel p-7"><h1 className="text-xl font-semibold">{isRegister ? 'Create your account' : 'Welcome back'}</h1><p className="mt-1 text-sm text-zinc-500">{isRegister ? 'Start collaborating with your team.' : 'Sign in to continue to your workspace.'}</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        {expired && !error && <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">Your session expired. Please sign in again.</p>}
        {isRegister && <Field label="Name" name="name" value={form.name} onChange={change} placeholder="Your name"/>}
        <Field label="Email" name="email" type="email" value={form.email} onChange={change} placeholder="you@company.com"/>
        <Field label="Password" name="password" type="password" value={form.password} onChange={change} placeholder="At least 8 characters"/>
        {error && <p className="text-xs text-rose-400">{error}</p>}
        <button disabled={busy} className="w-full rounded-lg bg-violet-500 py-2.5 text-sm font-semibold text-white hover:bg-violet-400 disabled:opacity-50">{busy ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}</button>
      </form>
    </div>
    <p className="mt-5 text-center text-sm text-zinc-500">{isRegister ? 'Already have an account?' : "Don't have an account?"} <Link className="text-violet-300 hover:text-violet-200" to={isRegister ? '/login' : '/register'}>{isRegister ? 'Sign in' : 'Sign up'}</Link></p>
  </div></main>;
}
function Field({ label, ...props }) { return <label className="block"><span className="mb-1.5 block text-xs font-medium text-zinc-400">{label}</span><input required {...props} className="w-full rounded-lg border border-line bg-ink px-3 py-2.5 text-sm outline-none transition placeholder:text-zinc-700 focus:border-violet-500"/></label>; }
