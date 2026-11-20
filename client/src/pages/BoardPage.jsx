import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, RefreshCw, Users } from 'lucide-react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';
import TicketCard from '../components/TicketCard';

const columns = ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'];
const label = s => s.replace('_', ' ');
export default function BoardPage() {
  const { id } = useParams(); const { user } = useAuth();
  const [workspace, setWorkspace] = useState(null); const [tickets, setTickets] = useState([]); const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', priority: 'MEDIUM', assignedTo: '' });
  const [inviteEmail, setInviteEmail] = useState(''); const [inviteOpen, setInviteOpen] = useState(false); const [error, setError] = useState(''); const [syncing, setSyncing] = useState(false);
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setSyncing(true);
    try { const [w, t] = await Promise.all([api.get('/api/workspaces'), api.get(`/api/tickets/workspace/${id}`)]); setWorkspace(w.data.find(x => x._id === id) || null); setTickets(t.data); setError(''); }
    catch (e) { setError(e.response?.data?.message || 'Unable to load board'); }
    finally { setSyncing(false); }
  }, [id]);
  useEffect(() => { load(); const timer = setInterval(() => { if (document.visibilityState === 'visible') load(true); }, 5000); const onVisible = () => { if (document.visibilityState === 'visible') load(true); }; document.addEventListener('visibilitychange', onVisible); return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); }; }, [load]);
  const members = workspace?.members || [];
  const myMember = members.find(m => (m.user?._id || m.user) === user?.id);
  const isAdmin = myMember?.role === 'ADMIN';
  const grouped = useMemo(() => Object.fromEntries(columns.map(s => [s, tickets.filter(t => t.status === s)])), [tickets]);
  const createTicket = async e => { e.preventDefault(); try { const { data } = await api.post('/api/tickets', { ...form, assignedTo: form.assignedTo || null, workspace: id }); setTickets(old => [data, ...old]); setOpen(false); setForm({ title: '', description: '', priority: 'MEDIUM', assignedTo: '' }); } catch (e) { setError(e.response?.data?.message || 'Could not create ticket'); } };
  const changeStatus = async (ticketId, status) => {
    const before = tickets; setTickets(old => old.map(t => t._id === ticketId ? { ...t, status } : t));
    try { const { data } = await api.patch(`/api/tickets/${ticketId}/status`, { status }); setTickets(old => old.map(t => t._id === ticketId ? data : t)); }
    catch (e) { setTickets(before); setError(e.response?.data?.message || 'Status update failed'); }
  };
  const deleteTicket = async ticketId => { const before = tickets; setTickets(old => old.filter(t => t._id !== ticketId)); try { await api.delete(`/api/tickets/${ticketId}`); } catch (e) { setTickets(before); setError(e.response?.data?.message || 'Delete failed'); } };
  const invite = async e => { e.preventDefault(); try { const { data } = await api.post(`/api/workspaces/${id}/members`, { email: inviteEmail }); setWorkspace(data); setInviteEmail(''); setInviteOpen(false); } catch (e) { setError(e.response?.data?.message || 'Invite failed'); } };
  return <main className="min-h-screen"><header className="sticky top-0 z-20 border-b border-line bg-ink/90 backdrop-blur"><div className="mx-auto flex max-w-[1500px] items-center justify-between px-5 py-4"><div className="flex min-w-0 items-center gap-3"><Link to="/workspaces" className="text-zinc-500 hover:text-white"><ArrowLeft size={18}/></Link><div className="h-5 w-px bg-line"/><div className="min-w-0"><p className="truncate text-sm font-semibold">{workspace?.name || 'Sprint workspace'}</p><p className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Sprint board / {id.slice(-6)}</p></div></div><div className="flex items-center gap-2"><span className="hidden items-center gap-1.5 text-xs text-zinc-500 sm:flex"><span className={`h-1.5 w-1.5 rounded-full ${syncing ? 'bg-amber-400' : 'bg-emerald-400'}`}/>{syncing ? 'Syncing' : 'Live · 5s'}</span>{isAdmin && <button onClick={() => setInviteOpen(true)} className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs text-zinc-300 hover:border-zinc-500"><Users size={14}/> Invite</button>}<button onClick={() => setOpen(true)} className="flex items-center gap-1.5 rounded-lg bg-violet-500 px-3 py-2 text-xs font-semibold hover:bg-violet-400"><Plus size={15}/> New ticket</button></div></div></header>
    <section className="mx-auto max-w-[1500px] px-5 py-8"><div className="mb-7 flex items-end justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.2em] text-violet-400">Sprint overview</p><h1 className="mt-2 text-2xl font-bold">Board</h1><p className="mt-1 text-xs text-zinc-500">{tickets.length} tickets · {members.length} collaborators</p></div><button onClick={() => load()} className="text-zinc-500 hover:text-white" title="Refresh"><RefreshCw size={15}/></button></div>
      {error && <div className="mb-4 flex items-center justify-between rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-xs text-rose-300">{error}<button onClick={() => setError('')}>×</button></div>}
      {!workspace && !error ? <p className="text-sm text-zinc-500">Loading workspace…</p> : <div className="grid gap-4 xl:grid-cols-4 md:grid-cols-2">{columns.map((status, index) => <section key={status} className="min-w-0"><div className="mb-3 flex items-center justify-between border-b border-line pb-3"><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${['bg-zinc-500','bg-blue-400','bg-amber-400','bg-emerald-400'][index]}`}/><h2 className="font-mono text-[11px] font-semibold tracking-wider text-zinc-300">{label(status)}</h2><span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">{grouped[status].length}</span></div></div><div className="space-y-2.5">{grouped[status].map(t => <TicketCard key={t._id} ticket={t} onStatus={changeStatus} onDelete={deleteTicket}/>)}</div>{grouped[status].length === 0 && <div className="rounded-xl border border-dashed border-line/80 py-8 text-center text-[11px] text-zinc-700">No tickets</div>}</section>)}</div>}
    </section>
    {open && <Modal title="Create ticket" onClose={() => setOpen(false)}><form onSubmit={createTicket} className="space-y-3"><Field label="Title"><input required maxLength="160" value={form.title} onChange={e => setForm({...form,title:e.target.value})} placeholder="What needs to be done?"/></Field><Field label="Description"><textarea rows="3" value={form.description} onChange={e => setForm({...form,description:e.target.value})} placeholder="Add context or acceptance criteria…"/></Field><div className="grid grid-cols-2 gap-3"><Field label="Priority"><select value={form.priority} onChange={e => setForm({...form,priority:e.target.value})}><option>LOW</option><option>MEDIUM</option><option>HIGH</option></select></Field><Field label="Assignee"><select value={form.assignedTo} onChange={e => setForm({...form,assignedTo:e.target.value})}><option value="">Unassigned</option>{members.map(m => <option key={m.user._id} value={m.user._id}>{m.user.name}</option>)}</select></Field></div><button className="w-full rounded-lg bg-violet-500 py-2.5 text-sm font-semibold">Create ticket</button></form></Modal>}
    {inviteOpen && <Modal title="Invite teammate" onClose={() => setInviteOpen(false)}><form onSubmit={invite}><p className="mb-3 text-xs text-zinc-500">The teammate must have an account first. They will join as a member.</p><input required type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="teammate@company.com" className="w-full rounded-lg border border-line bg-ink px-3 py-2.5 text-sm outline-none focus:border-violet-500"/><button className="mt-4 w-full rounded-lg bg-violet-500 py-2.5 text-sm font-semibold">Add member</button></form></Modal>}
  </main>;
}
function Field({ label, children }) { return <label className="block"><span className="mb-1.5 block text-xs text-zinc-400">{label}</span>{React.cloneElement(children, { className: "w-full rounded-lg border border-line bg-ink px-3 py-2.5 text-sm outline-none focus:border-violet-500" })}</label>; }
