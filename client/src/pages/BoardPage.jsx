import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DndContext, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors, useDroppable, closestCorners } from '@dnd-kit/core';
import { ArrowLeft, Plus, RefreshCw, Search, SlidersHorizontal, Users, X } from 'lucide-react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../context/RealtimeContext';
import Modal from '../components/Modal';
import TicketCard, { DraggableTicket } from '../components/TicketCard';
import TicketDetail from '../components/TicketDetail';
import MembersModal from '../components/MembersModal';
import { Field, SelectField, PRIORITY_OPTIONS, STATUS_OPTIONS } from '../components/Form';

const columns = ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'];
const columnDot = ['bg-zinc-500', 'bg-blue-400', 'bg-amber-400', 'bg-emerald-400'];
const label = s => s.replace('_', ' ');

function Column({ status, index, count, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return <section className="min-w-0">
    <div className="mb-3 flex items-center justify-between border-b border-line pb-3">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${columnDot[index]}`}/>
        <h2 className="font-mono text-[11px] font-semibold tracking-wider text-zinc-300">{label(status)}</h2>
        <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">{count}</span>
      </div>
    </div>
    <div ref={setNodeRef} className={`space-y-2.5 rounded-xl transition ${isOver ? 'bg-violet-500/5 ring-1 ring-violet-500/30' : ''}`}>
      {children}
      {count === 0 && <div className="rounded-xl border border-dashed border-line/80 py-8 text-center text-[11px] text-zinc-700">Drop tickets here</div>}
    </div>
  </section>;
}

export default function BoardPage() {
  const { id } = useParams(); const { user } = useAuth();
  const { socket, connected } = useRealtime();

  const [workspace, setWorkspace] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', priority: 'MEDIUM', assignedTo: '' });
  const [membersOpen, setMembersOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [query, setQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setSyncing(true);
    try {
      const [w, t] = await Promise.all([api.get('/api/workspaces'), api.get(`/api/tickets/workspace/${id}`)]);
      setWorkspace(w.data.find(x => x._id === id) || null);
      setTickets(t.data);
      setError('');
    } catch (e) { setError(e.response?.data?.message || 'Unable to load board'); }
    finally { setSyncing(false); setLoading(false); }
  }, [id]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  // Room subscription + reconnect catch-up.
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);
  useEffect(() => {
    if (!socket) return;
    socket.emit('workspace:join', id);
    const onConnect = () => { socket.emit('workspace:join', id); loadRef.current(true); };
    socket.on('connect', onConnect);
    return () => { socket.off('connect', onConnect); socket.emit('workspace:leave', id); };
  }, [socket, id]);

  // Realtime deltas. Own events are skipped: the mutation already applied them.
  useEffect(() => {
    if (!socket) return;
    const mine = actorId => String(actorId) === String(user?.id);
    const onCreated = ({ ticket, actorId }) => {
      if (mine(actorId)) return;
      setTickets(old => old.some(t => t._id === ticket._id) ? old : [ticket, ...old]);
    };
    const onUpdated = ({ ticket, actorId }) => {
      if (mine(actorId)) return;
      setTickets(old => old.map(t => t._id === ticket._id ? ticket : t));
      setDetail(d => (d && d._id === ticket._id ? ticket : d));
    };
    const onDeleted = ({ id: ticketId, actorId }) => {
      if (mine(actorId)) return;
      setTickets(old => old.filter(t => t._id !== ticketId));
      setDetail(d => (d && d._id === ticketId ? null : d));
    };
    const onWorkspaceChange = ({ workspace: ws }) => { if (ws?._id === id) setWorkspace(ws); };
    socket.on('ticket:created', onCreated);
    socket.on('ticket:updated', onUpdated);
    socket.on('ticket:deleted', onDeleted);
    socket.on('member:added', onWorkspaceChange);
    socket.on('member:updated', onWorkspaceChange);
    socket.on('member:removed', onWorkspaceChange);
    return () => {
      socket.off('ticket:created', onCreated);
      socket.off('ticket:updated', onUpdated);
      socket.off('ticket:deleted', onDeleted);
      socket.off('member:added', onWorkspaceChange);
      socket.off('member:updated', onWorkspaceChange);
      socket.off('member:removed', onWorkspaceChange);
    };
  }, [socket, id, user?.id]);

  const members = workspace?.members || [];
  const myMember = members.find(m => (m.user?._id || m.user) === user?.id);
  const isAdmin = myMember?.role === 'ADMIN';

  // Client-side search + filters over the already-loaded board.
  const visible = useMemo(() => tickets.filter(t => {
    if (query && !`${t.title} ${t.description}`.toLowerCase().includes(query.toLowerCase())) return false;
    if (assigneeFilter === '__none__') {
      if (t.assignedTo) return false;
    } else if (assigneeFilter && (t.assignedTo?._id || '') !== assigneeFilter) {
      return false;
    }
    if (priorityFilter && t.priority !== priorityFilter) return false;
    return true;
  }), [tickets, query, assigneeFilter, priorityFilter]);

  const grouped = useMemo(() => Object.fromEntries(columns.map(s => [s, visible.filter(t => t.status === s)])), [visible]);
  const filtersActive = Boolean(query || assigneeFilter || priorityFilter);
  const draggingTicket = tickets.find(t => t._id === draggingId) || null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  const changeStatus = async (ticketId, status) => {
    const before = tickets;
    setTickets(old => old.map(t => t._id === ticketId ? { ...t, status } : t));
    try {
      const { data } = await api.patch(`/api/tickets/${ticketId}/status`, { status });
      setTickets(old => old.map(t => t._id === ticketId ? data : t));
      setDetail(d => (d && d._id === ticketId ? data : d));
    } catch (e) { setTickets(before); setError(e.response?.data?.message || 'Status update failed'); }
  };

  const onDragEnd = ({ active, over }) => {
    setDraggingId(null);
    if (!over) return;
    const target = columns.includes(over.id) ? over.id : tickets.find(t => t._id === over.id)?.status;
    const ticket = tickets.find(t => t._id === active.id);
    if (!target || !ticket || ticket.status === target) return;
    changeStatus(active.id, target);
  };

  const deleteTicket = async ticketId => {
    const before = tickets;
    setTickets(old => old.filter(t => t._id !== ticketId));
    setDetail(d => (d && d._id === ticketId ? null : d));
    try { await api.delete(`/api/tickets/${ticketId}`); }
    catch (e) { setTickets(before); setError(e.response?.data?.message || 'Delete failed'); }
  };

  const createTicket = async e => {
    e.preventDefault();
    try {
      const { data } = await api.post('/api/tickets', { ...form, assignedTo: form.assignedTo || null, workspace: id });
      setTickets(old => [data, ...old]);
      setOpen(false);
      setForm({ title: '', description: '', priority: 'MEDIUM', assignedTo: '' });
    } catch (e) { setError(e.response?.data?.message || 'Could not create ticket'); }
  };

  return <main className="min-h-screen">
    <header className="sticky top-0 z-20 border-b border-line bg-ink/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1500px] items-center justify-between px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/workspaces" className="text-zinc-500 hover:text-white"><ArrowLeft size={18}/></Link>
          <div className="h-5 w-px bg-line"/>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{workspace?.name || 'Sprint workspace'}</p>
            <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Sprint board / {id.slice(-6)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1.5 text-xs text-zinc-500 sm:flex">
            <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`}/>{connected ? 'Live' : 'Reconnecting…'}
          </span>
          <button onClick={() => setMembersOpen(true)} className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs text-zinc-300 hover:border-zinc-500"><Users size={14}/> {members.length}</button>
          <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 rounded-lg bg-violet-500 px-3 py-2 text-xs font-semibold hover:bg-violet-400"><Plus size={15}/> New ticket</button>
        </div>
      </div>
    </header>

    <section className="mx-auto max-w-[1500px] px-5 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[.2em] text-violet-400">Sprint overview</p>
          <h1 className="mt-2 text-2xl font-bold">Board</h1>
          <p className="mt-1 text-xs text-zinc-500">
            {filtersActive ? `${visible.length} of ${tickets.length} tickets` : `${tickets.length} tickets`} · {members.length} collaborators
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600"/>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search tickets…" className="w-52 rounded-lg border border-line bg-ink py-2 pl-8 pr-3 text-xs outline-none placeholder:text-zinc-600 focus:border-violet-500"/>
          </div>
          <button onClick={() => setFiltersOpen(o => !o)} className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs transition ${filtersActive ? 'border-violet-500/50 text-violet-300' : 'border-line text-zinc-300 hover:border-zinc-500'}`}>
            <SlidersHorizontal size={14}/> Filters
          </button>
          <button onClick={() => load()} className="text-zinc-500 hover:text-white" title="Refresh"><RefreshCw size={15} className={syncing ? 'animate-spin' : ''}/></button>
        </div>
      </div>

      {filtersOpen && <div className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-panel p-4">
        <div className="w-44"><SelectField label="Assignee" value={assigneeFilter} allowEmpty placeholder="Anyone" onChange={e => setAssigneeFilter(e.target.value)}
          options={[{ value: '__none__', label: 'Unassigned' }, ...members.map(m => ({ value: m.user._id, label: m.user.name }))]}/></div>
        <div className="w-44"><SelectField label="Priority" value={priorityFilter} allowEmpty placeholder="Any priority" onChange={e => setPriorityFilter(e.target.value)} options={PRIORITY_OPTIONS}/></div>
        {filtersActive && <button onClick={() => { setQuery(''); setAssigneeFilter(''); setPriorityFilter(''); }} className="flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-xs text-zinc-400 hover:text-white"><X size={13}/> Clear</button>}
      </div>}

      {error && <div className="mb-4 flex items-center justify-between rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-xs text-rose-300">{error}<button onClick={() => setError('')}>×</button></div>}

      {loading ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{columns.map((status, i) => <section key={status} className="min-w-0">
        <div className="mb-3 flex items-center gap-2 border-b border-line pb-3"><span className={`h-2 w-2 rounded-full ${columnDot[i]}`}/><h2 className="font-mono text-[11px] font-semibold tracking-wider text-zinc-300">{label(status)}</h2></div>
        <div className="animate-pulse space-y-2.5">{[0, 1].map(k => <div key={k} className="rounded-xl border border-line bg-panel p-4"><div className="h-3 w-3/4 rounded bg-white/5"/><div className="mt-3 h-2.5 w-1/2 rounded bg-white/5"/><div className="mt-3 h-5 w-16 rounded bg-white/5"/></div>)}</div>
      </section>)}</div>
      : !workspace ? <p className="text-sm text-zinc-500">Workspace not found.</p>
      : <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={({ active }) => setDraggingId(active.id)} onDragEnd={onDragEnd} onDragCancel={() => setDraggingId(null)}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {columns.map((status, index) => <Column key={status} status={status} index={index} count={grouped[status].length}>
              {grouped[status].map(t => <DraggableTicket key={t._id} ticket={t}
                canDelete={isAdmin || t.createdBy?._id === user?.id}
                onOpen={setDetail} onStatus={changeStatus} onDelete={deleteTicket}/>)}
            </Column>)}
          </div>
          <DragOverlay>{draggingTicket ? <div className="w-72 rotate-2 opacity-90"><TicketCard ticket={draggingTicket} onOpen={() => {}} onStatus={() => {}} onDelete={() => {}} canDelete={false}/></div> : null}</DragOverlay>
        </DndContext>}
    </section>

    {open && <Modal title="Create ticket" onClose={() => setOpen(false)}>
      <form onSubmit={createTicket} className="space-y-3">
        <Field label="Title" hint="One clear action, e.g. “Fix expired-token redirect”.">
          <input required maxLength="160" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="What needs to be done?"/>
        </Field>
        <Field label="Description" hint="Context, acceptance criteria, links.">
          <textarea rows="3" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="What does done look like? Any edge cases?"/>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Priority" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} options={PRIORITY_OPTIONS} placeholder="Select priority…"/>
          <SelectField label="Assignee" value={form.assignedTo} allowEmpty onChange={e => setForm({ ...form, assignedTo: e.target.value })} placeholder="Unassigned"
            options={members.map(m => ({ value: m.user._id, label: `${m.user.name} (${m.role.toLowerCase()})` }))}/>
        </div>
        <button className="w-full rounded-lg bg-violet-500 py-2.5 text-sm font-semibold">Create ticket</button>
      </form>
    </Modal>}

    {membersOpen && <MembersModal workspace={workspace} isAdmin={isAdmin} currentUserId={user?.id} onClose={() => setMembersOpen(false)} onChange={setWorkspace}/>}

    {detail && <TicketDetail ticket={detail} workspace={workspace} isAdmin={isAdmin}
      onClose={() => setDetail(null)}
      onSaved={updated => { setTickets(old => old.map(t => t._id === updated._id ? updated : t)); setDetail(updated); }}
      onDeleted={deleteTicket}/>}
  </main>;
}
