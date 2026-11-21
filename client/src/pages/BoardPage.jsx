import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DndContext, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors, useDroppable, closestCorners } from '@dnd-kit/core';
import { Archive, ArrowLeft, Download, Plus, RefreshCw, Search, SlidersHorizontal, Users, X } from 'lucide-react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../context/RealtimeContext';
import Modal from '../components/Modal';
import TicketCard, { DraggableTicket } from '../components/TicketCard';
import TicketDetail from '../components/TicketDetail';
import MembersModal from '../components/MembersModal';
import BoardStats from '../components/BoardStats';
import NotificationBell from '../components/NotificationBell';
import { Field, SelectField, PRIORITY_OPTIONS, STATUS_OPTIONS } from '../components/Form';
import { initials } from '../utils/format';

const columns = ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'];
const columnDot = ['bg-zinc-500', 'bg-blue-400', 'bg-amber-400', 'bg-emerald-400'];
const label = s => s.replace('_', ' ');

const emptyTicket = { title: '', description: '', priority: 'MEDIUM', assignedTo: '', dueDate: '', points: '0', labels: '' };

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
  const [stats, setStats] = useState(null);
  const [presence, setPresence] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyTicket);
  const [membersOpen, setMembersOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [query, setQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [labelFilter, setLabelFilter] = useState('');
  const [mineOnly, setMineOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const searchRef = useRef(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setSyncing(true);
    try {
      const [w, t, s] = await Promise.all([
        api.get('/api/workspaces'),
        api.get(`/api/tickets/workspace/${id}`, { params: showArchived ? { archived: 'true' } : {} }),
        api.get(`/api/workspaces/${id}/stats`)
      ]);
      setWorkspace(w.data.find(x => x._id === id) || null);
      setTickets(t.data);
      setStats(s.data);
      setError('');
    } catch (e) { setError(e.response?.data?.message || 'Unable to load board'); }
    finally { setSyncing(false); setLoading(false); }
  }, [id, showArchived]);

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

  // Who else is on this board right now.
  useEffect(() => {
    if (!socket) return;
    const onPresence = ({ workspace: wsId, users }) => { if (wsId === id) setPresence(users || []); };
    socket.on('presence:update', onPresence);
    return () => socket.off('presence:update', onPresence);
  }, [socket, id]);

  // Realtime deltas. Own events are skipped: the mutation already applied them.
  useEffect(() => {
    if (!socket) return;
    const mine = actorId => String(actorId) === String(user?.id);
    const onCreated = ({ ticket, actorId }) => {
      if (mine(actorId)) return;
      setTickets(old => old.some(t => t._id === ticket._id) ? old : [ticket, ...old]);
      loadRef.current(true);
    };
    const onUpdated = ({ ticket, actorId }) => {
      if (mine(actorId)) return;
      setTickets(old => old.map(t => t._id === ticket._id ? ticket : t));
      setDetail(d => (d && d._id === ticket._id ? ticket : d));
      loadRef.current(true);
    };
    const onDeleted = ({ id: ticketId, actorId }) => {
      if (mine(actorId)) return;
      setTickets(old => old.filter(t => t._id !== ticketId));
      setDetail(d => (d && d._id === ticketId ? null : d));
      loadRef.current(true);
    };
    const onBulk = ({ tickets: changed, actorId }) => {
      if (mine(actorId)) return;
      setTickets(old => old.map(t => changed.find(c => c._id === t._id) || t));
      loadRef.current(true);
    };
    const onWorkspaceChange = ({ workspace: ws }) => { if (ws?._id === id) setWorkspace(ws); };
    socket.on('ticket:created', onCreated);
    socket.on('ticket:updated', onUpdated);
    socket.on('ticket:deleted', onDeleted);
    socket.on('ticket:bulk', onBulk);
    socket.on('member:added', onWorkspaceChange);
    socket.on('member:updated', onWorkspaceChange);
    socket.on('member:removed', onWorkspaceChange);
    socket.on('workspace:updated', onWorkspaceChange);
    return () => {
      socket.off('ticket:created', onCreated);
      socket.off('ticket:updated', onUpdated);
      socket.off('ticket:deleted', onDeleted);
      socket.off('ticket:bulk', onBulk);
      socket.off('member:added', onWorkspaceChange);
      socket.off('member:updated', onWorkspaceChange);
      socket.off('member:removed', onWorkspaceChange);
      socket.off('workspace:updated', onWorkspaceChange);
    };
  }, [socket, id, user?.id]);

  // "/" focuses search, "n" opens the create dialog, Escape clears selection.
  useEffect(() => {
    const onKey = (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
      if (typing) return;
      if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'n' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setOpen(true); }
      if (e.key === 'Escape') setSelected([]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const members = workspace?.members || [];
  const myMember = members.find(m => (m.user?._id || m.user) === user?.id);
  const isAdmin = myMember?.role === 'ADMIN';

  const allLabels = useMemo(() => [...new Set(tickets.flatMap(t => t.labels || []))].sort(), [tickets]);

  // Client-side search + filters over the already-loaded board.
  const visible = useMemo(() => tickets.filter(t => {
    if (query) {
      const haystack = `${t.title} ${t.description} ${(t.labels || []).join(' ')}`.toLowerCase();
      if (!haystack.includes(query.toLowerCase())) return false;
    }
    if (assigneeFilter === '__none__') {
      if (t.assignedTo) return false;
    } else if (assigneeFilter === '__me__') {
      if ((t.assignedTo?._id || '') !== user?.id) return false;
    } else if (assigneeFilter && (t.assignedTo?._id || '') !== assigneeFilter) {
      return false;
    }
    if (priorityFilter && t.priority !== priorityFilter) return false;
    if (labelFilter && !(t.labels || []).includes(labelFilter)) return false;
    if (mineOnly && (t.assignedTo?._id || '') !== user?.id) return false;
    return true;
  }), [tickets, query, assigneeFilter, priorityFilter, labelFilter, mineOnly, user?.id]);

  const grouped = useMemo(() => Object.fromEntries(columns.map(s => [s, visible.filter(t => t.status === s)])), [visible]);
  const filtersActive = Boolean(query || assigneeFilter || priorityFilter || labelFilter || mineOnly);
  const draggingTicket = tickets.find(t => t._id === draggingId) || null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  const clearFilters = () => { setQuery(''); setAssigneeFilter(''); setPriorityFilter(''); setLabelFilter(''); setMineOnly(false); };

  const changeStatus = async (ticketId, status) => {
    const before = tickets;
    setTickets(old => old.map(t => t._id === ticketId ? { ...t, status } : t));
    try {
      const { data } = await api.patch(`/api/tickets/${ticketId}/status`, { status });
      setTickets(old => old.map(t => t._id === ticketId ? data : t));
      setDetail(d => (d && d._id === ticketId ? data : d));
      loadRef.current(true);
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
    setSelected(old => old.filter(x => x !== ticketId));
    try { await api.delete(`/api/tickets/${ticketId}`); loadRef.current(true); }
    catch (e) { setTickets(before); setError(e.response?.data?.message || 'Delete failed'); }
  };

  const createTicket = async e => {
    e.preventDefault();
    try {
      const { data } = await api.post('/api/tickets', {
        title: form.title,
        description: form.description,
        priority: form.priority,
        assignedTo: form.assignedTo || null,
        dueDate: form.dueDate || null,
        points: Number(form.points) || 0,
        labels: form.labels.split(',').map(l => l.trim()).filter(Boolean),
        workspace: id
      });
      setTickets(old => [data, ...old]);
      setOpen(false);
      setForm(emptyTicket);
      loadRef.current(true);
    } catch (e) { setError(e.response?.data?.message || 'Could not create ticket'); }
  };

  const toggleSelect = ticketId => setSelected(old =>
    old.includes(ticketId) ? old.filter(x => x !== ticketId) : [...old, ticketId]);

  const bulk = async (patch) => {
    if (!selected.length) return;
    try {
      const { data } = await api.post('/api/tickets/bulk', { ids: selected, ...patch });
      setTickets(old => old.map(t => data.find(d => d._id === t._id) || t).filter(t => !t.archived));
      setSelected([]);
      loadRef.current(true);
    } catch (e) { setError(e.response?.data?.message || 'Bulk update failed'); }
  };

  const exportCsv = async () => {
    try {
      const { data } = await api.get(`/api/tickets/workspace/${id}/export`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([data], { type: 'text/csv' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${(workspace?.name || 'board').replace(/\s+/g, '-').toLowerCase()}-tickets.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e) { setError(e.response?.data?.message || 'Export failed'); }
  };

  const others = presence.filter(p => String(p._id) !== String(user?.id));

  return <main className="min-h-screen">
    <header className="sticky top-0 z-20 border-b border-line bg-ink/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/workspaces" className="text-zinc-500 hover:text-white"><ArrowLeft size={18}/></Link>
          <div className="h-5 w-px bg-line"/>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{workspace?.name || 'Sprint workspace'}</p>
            <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Sprint board / {id.slice(-6)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {others.length > 0 && <div className="hidden items-center -space-x-1.5 sm:flex" title={`${others.map(o => o.name).join(', ')} viewing`}>
            {others.slice(0, 4).map(p => <span key={p._id} title={p.name}
              className="grid h-6 w-6 place-items-center rounded-full border border-ink bg-violet-500/20 font-mono text-[9px] font-semibold text-violet-200">{initials(p.name)}</span>)}
            {others.length > 4 && <span className="grid h-6 w-6 place-items-center rounded-full border border-ink bg-white/5 font-mono text-[9px] text-zinc-400">+{others.length - 4}</span>}
          </div>}
          <span className="hidden items-center gap-1.5 text-xs text-zinc-500 sm:flex">
            <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`}/>{connected ? 'Live' : 'Reconnecting…'}
          </span>
          <NotificationBell/>
          <button onClick={() => setMembersOpen(true)} className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs text-zinc-300 hover:border-zinc-500"><Users size={14}/> {members.length}</button>
          <button onClick={() => setOpen(true)} title="New ticket (n)" className="flex items-center gap-1.5 rounded-lg bg-violet-500 px-3 py-2 text-xs font-semibold hover:bg-violet-400"><Plus size={15}/> New ticket</button>
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
            {others.length > 0 && <span className="text-violet-400"> · {others.length} viewing now</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600"/>
            <input ref={searchRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search tickets… (/)"
              className="w-52 rounded-lg border border-line bg-ink py-2 pl-8 pr-3 text-xs outline-none placeholder:text-zinc-600 focus:border-violet-500"/>
          </div>
          <button onClick={() => setFiltersOpen(o => !o)} className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs transition ${filtersActive ? 'border-violet-500/50 text-violet-300' : 'border-line text-zinc-300 hover:border-zinc-500'}`}>
            <SlidersHorizontal size={14}/> Filters
          </button>
          <button onClick={() => setMineOnly(m => !m)} className={`rounded-lg border px-3 py-2 text-xs transition ${mineOnly ? 'border-violet-500/50 text-violet-300' : 'border-line text-zinc-300 hover:border-zinc-500'}`}>My tickets</button>
          <button onClick={() => { setShowArchived(a => !a); setSelected([]); }} title={showArchived ? 'Back to active board' : 'View archived tickets'}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs transition ${showArchived ? 'border-amber-400/50 text-amber-300' : 'border-line text-zinc-300 hover:border-zinc-500'}`}>
            <Archive size={14}/> {showArchived ? 'Archived' : 'Archive'}
          </button>
          <button onClick={exportCsv} title="Export board as CSV" className="rounded-lg border border-line p-2 text-zinc-400 hover:border-zinc-500 hover:text-white"><Download size={14}/></button>
          <button onClick={() => load()} className="text-zinc-500 hover:text-white" title="Refresh"><RefreshCw size={15} className={syncing ? 'animate-spin' : ''}/></button>
        </div>
      </div>

      {filtersOpen && <div className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-panel p-4">
        <div className="w-44"><SelectField label="Assignee" value={assigneeFilter} allowEmpty placeholder="Anyone" onChange={e => setAssigneeFilter(e.target.value)}
          options={[{ value: '__me__', label: 'Assigned to me' }, { value: '__none__', label: 'Unassigned' }, ...members.map(m => ({ value: m.user._id, label: m.user.name }))]}/></div>
        <div className="w-44"><SelectField label="Priority" value={priorityFilter} allowEmpty placeholder="Any priority" onChange={e => setPriorityFilter(e.target.value)} options={PRIORITY_OPTIONS}/></div>
        <div className="w-44"><SelectField label="Label" value={labelFilter} allowEmpty placeholder="Any label" onChange={e => setLabelFilter(e.target.value)}
          options={allLabels.map(l => ({ value: l, label: l }))}/></div>
        {filtersActive && <button onClick={clearFilters} className="flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-xs text-zinc-400 hover:text-white"><X size={13}/> Clear</button>}
      </div>}

      {error && <div className="mb-4 flex items-center justify-between rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-xs text-rose-300">{error}<button onClick={() => setError('')}>×</button></div>}

      {showArchived && <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs text-amber-300">
        <Archive size={13}/> Showing archived tickets. Restore one from its detail panel to put it back on the board.
      </div>}

      {!showArchived && <BoardStats stats={stats}/>}

      {selected.length > 0 && <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-violet-500/40 bg-violet-500/[.07] px-4 py-3">
        <p className="mr-1 text-xs font-semibold text-violet-200">{selected.length} selected</p>
        <select onChange={e => e.target.value && bulk({ status: e.target.value })} defaultValue=""
          className="rounded-lg border border-line bg-ink px-2 py-1.5 text-xs outline-none focus:border-violet-500">
          <option value="">Move to…</option>
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select onChange={e => e.target.value && bulk({ priority: e.target.value })} defaultValue=""
          className="rounded-lg border border-line bg-ink px-2 py-1.5 text-xs outline-none focus:border-violet-500">
          <option value="">Set priority…</option>
          {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select onChange={e => bulk({ assignedTo: e.target.value === '__none__' ? null : e.target.value })} defaultValue=""
          className="rounded-lg border border-line bg-ink px-2 py-1.5 text-xs outline-none focus:border-violet-500">
          <option value="">Assign to…</option>
          <option value="__none__">Unassigned</option>
          {members.map(m => <option key={m.user._id} value={m.user._id}>{m.user.name}</option>)}
        </select>
        {!showArchived && <button onClick={() => bulk({ archive: true })} className="flex items-center gap-1 rounded-lg border border-line px-2 py-1.5 text-xs text-zinc-300 hover:border-zinc-500"><Archive size={12}/> Archive</button>}
        {showArchived && <button onClick={() => bulk({ archive: false })} className="flex items-center gap-1 rounded-lg border border-line px-2 py-1.5 text-xs text-zinc-300 hover:border-zinc-500">Restore</button>}
        <button onClick={() => setSelected([])} className="ml-auto flex items-center gap-1 text-xs text-zinc-400 hover:text-white"><X size={13}/> Clear</button>
      </div>}

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
                selected={selected.includes(t._id)} onToggleSelect={toggleSelect}
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
        <div className="grid grid-cols-2 gap-3">
          <Field label="Due date" hint="Optional deadline.">
            <input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })}/>
          </Field>
          <SelectField label="Story points" value={form.points} onChange={e => setForm({ ...form, points: e.target.value })}
            options={[0, 1, 2, 3, 5, 8, 13].map(p => ({ value: String(p), label: p === 0 ? 'Not estimated' : `${p} points` }))}/>
        </div>
        <Field label="Labels" hint="Comma separated, e.g. bug, ui, backend.">
          <input value={form.labels} onChange={e => setForm({ ...form, labels: e.target.value })} placeholder="bug, ui"/>
        </Field>
        <button className="w-full rounded-lg bg-violet-500 py-2.5 text-sm font-semibold">Create ticket</button>
      </form>
    </Modal>}

    {membersOpen && <MembersModal workspace={workspace} isAdmin={isAdmin} currentUserId={user?.id} onClose={() => setMembersOpen(false)} onChange={setWorkspace}/>}

    {detail && <TicketDetail ticket={detail} workspace={workspace} isAdmin={isAdmin}
      onClose={() => setDetail(null)}
      onSaved={updated => {
        setTickets(old => updated.archived
          ? old.filter(t => t._id !== updated._id)
          : old.some(t => t._id === updated._id) ? old.map(t => t._id === updated._id ? updated : t) : [updated, ...old]);
        setDetail(updated);
        loadRef.current(true);
      }}
      onDeleted={deleteTicket}/>}
  </main>;
}
