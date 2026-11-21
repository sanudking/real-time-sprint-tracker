import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpRight, ListTodo, Layers3, LogOut, Plus, Settings2, Trash2, Users } from 'lucide-react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';
import NotificationBell from '../components/NotificationBell';
import { Field } from '../components/Form';

export default function WorkspacesPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // workspace being renamed
  const [editName, setEditName] = useState('');
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/workspaces');
      setItems(data);
      setError('');
    } catch (e) { setError(e.response?.data?.message || 'Could not load workspaces'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const create = async e => {
    e.preventDefault();
    try {
      const { data } = await api.post('/api/workspaces', { name });
      setItems([data, ...items]);
      setCreateOpen(false);
      setName('');
      navigate(`/workspace/${data._id}`);
    } catch (e) { setError(e.response?.data?.message || 'Could not create workspace'); }
  };

  const rename = async e => {
    e.preventDefault();
    if (!editing) return;
    try {
      const { data } = await api.patch(`/api/workspaces/${editing._id}`, { name: editName });
      setItems(old => old.map(w => (w._id === data._id ? data : w)));
      setEditing(null);
    } catch (e) { setError(e.response?.data?.message || 'Could not rename workspace'); }
  };

  const remove = async (ws) => {
    if (!window.confirm(`Delete “${ws.name}”? Its tickets will be removed permanently.`)) return;
    try {
      await api.delete(`/api/workspaces/${ws._id}`);
      setItems(old => old.filter(w => w._id !== ws._id));
    } catch (e) { setError(e.response?.data?.message || 'Could not delete workspace'); }
  };

  const isAdminOf = (ws) => {
    const me = ws.members.find(m => (m.user?._id || m.user) === user?.id);
    return me?.role === 'ADMIN';
  };

  return <main className="min-h-screen">
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2"><Layers3 className="text-violet-400" size={20}/><b>sprint<span className="text-violet-400">board</span></b></div>
        <div className="flex items-center gap-4 text-sm text-zinc-400">
          <Link to="/my-work" className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500"><ListTodo size={13}/> My work</Link>
          <NotificationBell/>
          <span className="hidden sm:inline">{user?.name}</span>
          <button onClick={() => { logout(); navigate('/login'); }} className="hover:text-white" title="Sign out"><LogOut size={16}/></button>
        </div>
      </div>
    </header>

    <section className="mx-auto max-w-6xl px-6 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[.2em] text-violet-400">Your organization</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Workspaces</h1>
          <p className="mt-2 text-sm text-zinc-500">Pick up where your team left off.</p>
        </div>
        <button onClick={() => setCreateOpen(true)} className="flex items-center gap-2 rounded-lg bg-violet-500 px-4 py-2.5 text-sm font-semibold hover:bg-violet-400"><Plus size={16}/> New workspace</button>
      </div>

      {error && <p className="mt-5 text-sm text-rose-400">{error}</p>}

      {loading ? <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map(i => <div key={i} className="animate-pulse rounded-xl border border-line bg-panel p-5"><div className="h-8 w-8 rounded-lg bg-white/5"/><div className="mt-5 h-4 w-2/3 rounded bg-white/5"/><div className="mt-3 h-3 w-1/3 rounded bg-white/5"/></div>)}</div>
        : items.length ? <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.map(w => <div key={w._id} className="group relative rounded-xl border border-line bg-panel p-5 transition hover:border-violet-500/50">
          <Link to={`/workspace/${w._id}`} className="block">
            <div className="flex items-start justify-between">
              <div className="rounded-lg bg-violet-500/10 p-2 text-violet-300"><Layers3 size={18}/></div>
              <ArrowUpRight size={17} className="text-zinc-600 group-hover:text-violet-300"/>
            </div>
            <h2 className="mt-5 truncate font-semibold">{w.name}</h2>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-zinc-500"><Users size={13}/>{w.members.length} members{isAdminOf(w) && <span className="ml-1 rounded border border-violet-400/30 px-1 font-mono text-[9px] text-violet-300">admin</span>}</p>
          </Link>
          {isAdminOf(w) && <div className="absolute bottom-4 right-4 flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
            <button onClick={() => { setEditing(w); setEditName(w.name); }} title="Rename workspace" className="rounded p-1.5 text-zinc-500 hover:bg-white/5 hover:text-violet-300"><Settings2 size={13}/></button>
            <button onClick={() => remove(w)} title="Delete workspace" className="rounded p-1.5 text-zinc-500 hover:bg-white/5 hover:text-rose-400"><Trash2 size={13}/></button>
          </div>}
        </div>)}</div>
        : <div className="mt-8 rounded-xl border border-dashed border-line py-16 text-center"><Layers3 className="mx-auto text-zinc-600" size={28}/><p className="mt-3 text-sm text-zinc-400">No workspaces yet</p><p className="mt-1 text-xs text-zinc-600">Create one to start your first sprint.</p></div>}
    </section>

    {createOpen && <Modal title="Create workspace" onClose={() => setCreateOpen(false)}>
      <form onSubmit={create}>
        <Field label="Workspace name" hint="Usually your team or product name.">
          <input autoFocus required maxLength="100" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Platform team"/>
        </Field>
        <button className="mt-4 w-full rounded-lg bg-violet-500 py-2.5 text-sm font-semibold">Create workspace</button>
      </form>
    </Modal>}

    {editing && <Modal title="Rename workspace" onClose={() => setEditing(null)}>
      <form onSubmit={rename}>
        <Field label="Workspace name">
          <input autoFocus required maxLength="100" value={editName} onChange={e => setEditName(e.target.value)}/>
        </Field>
        <button className="mt-4 w-full rounded-lg bg-violet-500 py-2.5 text-sm font-semibold">Save name</button>
      </form>
    </Modal>}
  </main>;
}
