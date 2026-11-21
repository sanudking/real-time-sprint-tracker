import { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, ArchiveRestore, Check, History, Plus, Send, Trash2, X } from 'lucide-react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../context/RealtimeContext';
import { Field, SelectField, PRIORITY_OPTIONS, STATUS_OPTIONS } from './Form';
import { dueMeta, labelTone, timeAgo, toDateInput } from '../utils/format';

const POINT_OPTIONS = [0, 1, 2, 3, 5, 8, 13];

const emptyForm = (ticket) => ({
  title: ticket.title || '',
  description: ticket.description || '',
  priority: ticket.priority || 'MEDIUM',
  status: ticket.status || 'TODO',
  assignedTo: ticket.assignedTo?._id || '',
  labels: ticket.labels || [],
  dueDate: toDateInput(ticket.dueDate),
  points: String(ticket.points || 0)
});

export default function TicketDetail({ ticket, workspace, isAdmin, onClose, onSaved, onDeleted }) {
  const { user } = useAuth();
  const { socket } = useRealtime();
  const members = workspace?.members || [];

  const [form, setForm] = useState(() => emptyForm(ticket));
  const [labelDraft, setLabelDraft] = useState('');
  const [comments, setComments] = useState([]);
  const [activity, setActivity] = useState([]);
  const [showActivity, setShowActivity] = useState(false);
  const [body, setBody] = useState('');
  const [subtaskDraft, setSubtaskDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const bodyRef = useRef(null);

  useEffect(() => {
    if (!ticket) return;
    setForm(emptyForm(ticket));
    setError('');
    api.get(`/api/comments/ticket/${ticket._id}`).then(r => setComments(r.data)).catch(() => setComments([]));
  }, [ticket?._id]);

  useEffect(() => {
    if (!ticket) return;
    setActivity([]);
    api.get(`/api/tickets/${ticket._id}/activity`).then(r => setActivity(r.data)).catch(() => setActivity([]));
  }, [ticket?._id]);

  // Live comments for the ticket currently open.
  useEffect(() => {
    if (!socket || !ticket) return;
    const onCreated = ({ comment, ticketId }) => {
      if (ticketId !== ticket._id) return;
      setComments(old => old.some(c => c._id === comment._id) ? old : [...old, comment]);
    };
    const onDeleted = ({ id, ticketId }) => {
      if (ticketId !== ticket._id) return;
      setComments(old => old.filter(c => c._id !== id));
    };
    socket.on('comment:created', onCreated);
    socket.on('comment:deleted', onDeleted);
    return () => { socket.off('comment:created', onCreated); socket.off('comment:deleted', onDeleted); };
  }, [socket, ticket?._id]);

  // Live audit trail while the panel is open.
  useEffect(() => {
    if (!socket || !ticket) return;
    const onActivity = ({ activity: entry, ticketId }) => {
      if (ticketId !== ticket._id) return;
      setActivity(old => [entry, ...old]);
    };
    socket.on('activity:created', onActivity);
    return () => socket.off('activity:created', onActivity);
  }, [socket, ticket?._id]);

  const mentionQuery = useMemo(() => {
    const match = /(?:^|\s)@([a-zA-Z0-9._-]*)$/.exec(body);
    return match ? match[1].toLowerCase() : null;
  }, [body]);

  const mentionMatches = useMemo(() => {
    if (mentionQuery === null) return [];
    return members
      .map(m => m.user)
      .filter(m => m && m.name.toLowerCase().replace(/\s+/g, '.').includes(mentionQuery)
        || m.name.toLowerCase().includes(mentionQuery))
      .slice(0, 5);
  }, [mentionQuery, members]);

  if (!ticket) return null;

  const dirty = form.title !== ticket.title
    || form.description !== (ticket.description || '')
    || form.priority !== ticket.priority
    || form.status !== ticket.status
    || form.assignedTo !== (ticket.assignedTo?._id || '')
    || form.dueDate !== toDateInput(ticket.dueDate)
    || String(form.points) !== String(ticket.points || 0)
    || form.labels.join(',') !== (ticket.labels || []).join(',');

  const patch = async (payload, message = 'Could not save ticket') => {
    try {
      const { data } = await api.patch(`/api/tickets/${ticket._id}`, payload);
      onSaved(data);
      return data;
    } catch (err) {
      setError(err.response?.data?.message || message);
      return null;
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const { data } = await api.patch(`/api/tickets/${ticket._id}`, {
        ...form,
        assignedTo: form.assignedTo || null,
        dueDate: form.dueDate || null,
        points: Number(form.points) || 0
      });
      onSaved(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save ticket');
    } finally { setSaving(false); }
  };

  const addLabel = (raw) => {
    const label = String(raw || '').trim().toLowerCase().slice(0, 24);
    if (!label || form.labels.includes(label) || form.labels.length >= 8) { setLabelDraft(''); return; }
    const next = [...form.labels, label];
    setForm(f => ({ ...f, labels: next }));
    setLabelDraft('');
    patch({ labels: next });
  };

  const removeLabel = (label) => {
    const next = form.labels.filter(l => l !== label);
    setForm(f => ({ ...f, labels: next }));
    patch({ labels: next });
  };

  const addSubtask = async (e) => {
    e.preventDefault();
    const title = subtaskDraft.trim();
    if (!title) return;
    setSubtaskDraft('');
    try {
      const { data } = await api.post(`/api/tickets/${ticket._id}/subtasks`, { title });
      onSaved(data);
    } catch (err) { setError(err.response?.data?.message || 'Could not add subtask'); }
  };

  const toggleSubtask = async (subtask) => {
    try {
      const { data } = await api.patch(`/api/tickets/${ticket._id}/subtasks/${subtask._id}`, { done: !subtask.done });
      onSaved(data);
    } catch (err) { setError(err.response?.data?.message || 'Could not update subtask'); }
  };

  const removeSubtask = async (subtask) => {
    try {
      const { data } = await api.delete(`/api/tickets/${ticket._id}/subtasks/${subtask._id}`);
      onSaved(data);
    } catch (err) { setError(err.response?.data?.message || 'Could not remove subtask'); }
  };

  const toggleArchive = async () => {
    try {
      const { data } = await api.patch(`/api/tickets/${ticket._id}/archive`, { archived: !ticket.archived });
      onSaved(data);
      if (!ticket.archived) onClose();
    } catch (err) { setError(err.response?.data?.message || 'Could not archive ticket'); }
  };

  const addComment = async (e) => {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setBody('');
    try {
      const { data } = await api.post('/api/comments', { ticket: ticket._id, body: text });
      setComments(old => old.some(c => c._id === data._id) ? old : [...old, data]);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not post comment');
    }
  };

  const insertMention = (member) => {
    setBody(old => old.replace(/@([a-zA-Z0-9._-]*)$/, `@${member.name.replace(/\s+/g, '.')} `));
    bodyRef.current?.focus();
  };

  const removeComment = async (id) => {
    const before = comments;
    setComments(old => old.filter(c => c._id !== id));
    try { await api.delete(`/api/comments/${id}`); }
    catch { setComments(before); setError('Could not delete comment'); }
  };

  const subtasks = ticket.subtasks || [];
  const subtasksDone = subtasks.filter(s => s.done).length;
  const due = dueMeta(ticket.dueDate);
  const canArchive = isAdmin || ticket.createdBy?._id === user?.id;

  return <div className="fixed inset-0 z-40 flex justify-end bg-black/60" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <aside className="flex h-full w-full max-w-xl flex-col border-l border-line bg-panel">
      <header className="flex items-center justify-between border-b border-line px-5 py-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-violet-400">
            #{String(ticket._id).slice(-6).toUpperCase()}
            {ticket.archived && <span className="rounded border border-amber-400/30 px-1 py-0.5 text-[9px] text-amber-300">Archived</span>}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">Opened {timeAgo(ticket.createdAt)} by {ticket.createdBy?.name || 'unknown'}</p>
        </div>
        <button onClick={onClose} className="text-zinc-400 hover:text-white"><X size={18}/></button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <form onSubmit={save} className="space-y-3">
          <Field label="Title" hint="Keep it short — one clear action.">
            <input required maxLength="160" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Fix login redirect on expired token"/>
          </Field>
          <Field label="Description" hint="Context, acceptance criteria, links.">
            <textarea rows="4" maxLength="3000" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="What does done look like? Any edge cases?"/>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <SelectField label="Priority" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} options={PRIORITY_OPTIONS} placeholder="Select priority…"/>
            <SelectField label="Status" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} options={STATUS_OPTIONS} placeholder="Select status…"/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Due date" hint={due ? due.label : 'Optional'}>
              <input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })}/>
            </Field>
            <Field label="Story points" hint="Rough effort size.">
              <select value={form.points} onChange={e => setForm({ ...form, points: e.target.value })}>
                {POINT_OPTIONS.map(p => <option key={p} value={p}>{p === 0 ? 'Not estimated' : `${p} points`}</option>)}
              </select>
            </Field>
          </div>
          <SelectField label="Assignee" value={form.assignedTo} allowEmpty onChange={e => setForm({ ...form, assignedTo: e.target.value })}
            placeholder="Unassigned" options={members.map(m => ({ value: m.user._id, label: `${m.user.name} (${m.role.toLowerCase()})` }))}/>

          <div>
            <span className="mb-1.5 block text-xs font-medium text-zinc-400">Labels</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {form.labels.map(label => <span key={label} className={`flex items-center gap-1 rounded border px-1.5 py-1 font-mono text-[10px] ${labelTone(label)}`}>
                {label}
                <button type="button" onClick={() => removeLabel(label)} className="opacity-60 hover:opacity-100"><X size={10}/></button>
              </span>)}
              {form.labels.length < 8 && <input value={labelDraft} onChange={e => setLabelDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addLabel(labelDraft); } }}
                onBlur={() => labelDraft && addLabel(labelDraft)}
                maxLength="24" placeholder="+ add label"
                className="w-24 rounded border border-dashed border-line bg-transparent px-1.5 py-1 font-mono text-[10px] outline-none placeholder:text-zinc-600 focus:border-violet-500"/>}
            </div>
          </div>

          {error && <p className="text-xs text-rose-400">{error}</p>}

          <div className="flex items-center gap-2 pt-1">
            <button disabled={saving || !dirty} className="flex-1 rounded-lg bg-violet-500 py-2.5 text-sm font-semibold disabled:opacity-40">{saving ? 'Saving…' : dirty ? 'Save changes' : 'No changes'}</button>
            {canArchive && <button type="button" onClick={toggleArchive} title={ticket.archived ? 'Restore to board' : 'Archive ticket'}
              className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2.5 text-xs text-zinc-300 hover:border-zinc-500">
              {ticket.archived ? <ArchiveRestore size={14}/> : <Archive size={14}/>}
            </button>}
            {(isAdmin || ticket.createdBy?._id === user?.id) && <button type="button" onClick={() => onDeleted(ticket._id)} className="rounded-lg border border-rose-500/30 px-3 py-2.5 text-xs text-rose-300 hover:bg-rose-500/10">Delete</button>}
          </div>
        </form>

        <section className="mt-7 border-t border-line pt-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Subtasks <span className="ml-1 font-mono text-[10px] text-zinc-600">{subtasksDone}/{subtasks.length}</span></h3>
          </div>
          {subtasks.length > 0 && <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-emerald-400/70 transition-all" style={{ width: `${subtasks.length ? (subtasksDone / subtasks.length) * 100 : 0}%` }}/></div>}
          <ul className="mt-3 space-y-1.5">
            {subtasks.map(sub => <li key={sub._id} className="group flex items-center gap-2 rounded-lg border border-line bg-ink/60 px-3 py-2">
              <button onClick={() => toggleSubtask(sub)} title={sub.done ? 'Mark not done' : 'Mark done'}
                className={`grid h-4 w-4 shrink-0 place-items-center rounded border transition ${sub.done ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300' : 'border-zinc-600 text-transparent hover:border-zinc-400'}`}>
                <Check size={11} strokeWidth={3}/>
              </button>
              <span className={`min-w-0 flex-1 truncate text-xs ${sub.done ? 'text-zinc-500 line-through' : 'text-zinc-300'}`}>{sub.title}</span>
              <button onClick={() => removeSubtask(sub)} title="Remove subtask" className="text-zinc-700 opacity-0 transition hover:text-rose-400 group-hover:opacity-100"><Trash2 size={12}/></button>
            </li>)}
          </ul>
          <form onSubmit={addSubtask} className="mt-2 flex items-center gap-2">
            <input value={subtaskDraft} onChange={e => setSubtaskDraft(e.target.value)} maxLength="200" placeholder="Add a subtask…"
              className="flex-1 rounded-lg border border-line bg-ink px-3 py-2 text-xs outline-none placeholder:text-zinc-600 focus:border-violet-500"/>
            <button disabled={!subtaskDraft.trim()} className="rounded-lg border border-line p-2 text-zinc-400 disabled:opacity-40 hover:text-violet-300" title="Add subtask"><Plus size={14}/></button>
          </form>
        </section>

        <section className="mt-7 border-t border-line pt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Comments <span className="ml-1 font-mono text-[10px] text-zinc-600">{comments.length}</span></h3>
          <div className="mt-3 space-y-3">
            {comments.length === 0 && <p className="text-xs text-zinc-600">No comments yet. Start the discussion.</p>}
            {comments.map(c => <div key={c._id} className="group rounded-lg border border-line bg-ink/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-zinc-200">{c.author?.name || 'Unknown'}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-zinc-600">{timeAgo(c.createdAt)}</span>
                  {(isAdmin || c.author?._id === user?.id) && <button onClick={() => removeComment(c._id)} className="text-zinc-700 opacity-0 transition hover:text-rose-400 group-hover:opacity-100"><Trash2 size={12}/></button>}
                </div>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-xs leading-5 text-zinc-400">{c.body}</p>
            </div>)}
          </div>
        </section>

        <section className="mt-7 border-t border-line pt-5">
          <button onClick={() => setShowActivity(s => !s)} className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wider text-zinc-400 hover:text-zinc-200">
            <span className="flex items-center gap-1.5"><History size={13}/> Activity <span className="font-mono text-[10px] text-zinc-600">{activity.length}</span></span>
            <span className="font-mono text-[10px] text-zinc-600">{showActivity ? 'hide' : 'show'}</span>
          </button>
          {showActivity && <ol className="mt-3 space-y-2 border-l border-line pl-3">
            {activity.length === 0 && <p className="text-xs text-zinc-600">No history recorded yet.</p>}
            {activity.map(entry => <li key={entry._id} className="relative">
              <span className="absolute -left-[17px] top-1.5 h-1.5 w-1.5 rounded-full bg-zinc-600"/>
              <p className="text-[11px] leading-5 text-zinc-400"><span className="text-zinc-200">{entry.actor?.name || 'Someone'}</span> {entry.detail || entry.action}</p>
              <p className="font-mono text-[10px] text-zinc-700">{timeAgo(entry.createdAt)}</p>
            </li>)}
          </ol>}
        </section>
      </div>

      <form onSubmit={addComment} className="relative border-t border-line p-4">
        {mentionMatches.length > 0 && <div className="absolute bottom-full left-4 right-4 mb-1 overflow-hidden rounded-lg border border-line bg-panel shadow-xl">
          {mentionMatches.map(m => <button type="button" key={m._id} onClick={() => insertMention(m)}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-zinc-300 hover:bg-white/5">
            <span>{m.name}</span><span className="font-mono text-[10px] text-zinc-600">{m.email}</span>
          </button>)}
        </div>}
        <div className="flex items-end gap-2">
          <textarea ref={bodyRef} rows="2" value={body} onChange={e => setBody(e.target.value)} maxLength="2000"
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addComment(e); }}
            placeholder="Add a comment… use @name to mention (⌘+Enter to send)"
            className="flex-1 resize-none rounded-lg border border-line bg-ink px-3 py-2 text-xs outline-none placeholder:text-zinc-600 focus:border-violet-500"/>
          <button disabled={!body.trim()} className="rounded-lg bg-violet-500 p-2.5 text-white disabled:opacity-40" title="Send"><Send size={15}/></button>
        </div>
      </form>
    </aside>
  </div>;
}
