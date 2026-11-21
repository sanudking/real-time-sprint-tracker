import { useEffect, useState } from 'react';
import { Send, Trash2, X } from 'lucide-react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../context/RealtimeContext';
import { Field, SelectField, PRIORITY_OPTIONS, STATUS_OPTIONS } from './Form';

const timeAgo = (iso) => {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

export default function TicketDetail({ ticket, workspace, isAdmin, onClose, onSaved, onDeleted }) {
  const { user } = useAuth();
  const { socket } = useRealtime();
  const members = workspace?.members || [];

  const [form, setForm] = useState({ title: '', description: '', priority: 'MEDIUM', status: 'TODO', assignedTo: '' });
  const [comments, setComments] = useState([]);
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!ticket) return;
    setForm({
      title: ticket.title || '',
      description: ticket.description || '',
      priority: ticket.priority || 'MEDIUM',
      status: ticket.status || 'TODO',
      assignedTo: ticket.assignedTo?._id || ''
    });
    setError('');
    api.get(`/api/comments/ticket/${ticket._id}`).then(r => setComments(r.data)).catch(() => setComments([]));
  }, [ticket]);

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

  if (!ticket) return null;

  const dirty = form.title !== ticket.title
    || form.description !== (ticket.description || '')
    || form.priority !== ticket.priority
    || form.status !== ticket.status
    || form.assignedTo !== (ticket.assignedTo?._id || '');

  const save = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const { data } = await api.patch(`/api/tickets/${ticket._id}`, {
        ...form, assignedTo: form.assignedTo || null
      });
      onSaved(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save ticket');
    } finally { setSaving(false); }
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

  const removeComment = async (id) => {
    const before = comments;
    setComments(old => old.filter(c => c._id !== id));
    try { await api.delete(`/api/comments/${id}`); }
    catch { setComments(before); setError('Could not delete comment'); }
  };

  return <div className="fixed inset-0 z-40 flex justify-end bg-black/60" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <aside className="flex h-full w-full max-w-xl flex-col border-l border-line bg-panel">
      <header className="flex items-center justify-between border-b border-line px-5 py-4">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-widest text-violet-400">#{String(ticket._id).slice(-6).toUpperCase()}</p>
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
          <SelectField label="Assignee" value={form.assignedTo} allowEmpty onChange={e => setForm({ ...form, assignedTo: e.target.value })}
            placeholder="Unassigned" options={members.map(m => ({ value: m.user._id, label: `${m.user.name} (${m.role.toLowerCase()})` }))}/>

          {error && <p className="text-xs text-rose-400">{error}</p>}

          <div className="flex items-center gap-2 pt-1">
            <button disabled={saving || !dirty} className="flex-1 rounded-lg bg-violet-500 py-2.5 text-sm font-semibold disabled:opacity-40">{saving ? 'Saving…' : dirty ? 'Save changes' : 'No changes'}</button>
            {(isAdmin || ticket.createdBy?._id === user?.id) && <button type="button" onClick={() => onDeleted(ticket._id)} className="rounded-lg border border-rose-500/30 px-3 py-2.5 text-xs text-rose-300 hover:bg-rose-500/10">Delete</button>}
          </div>
        </form>

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
      </div>

      <form onSubmit={addComment} className="border-t border-line p-4">
        <div className="flex items-end gap-2">
          <textarea rows="2" value={body} onChange={e => setBody(e.target.value)} maxLength="2000"
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addComment(e); }}
            placeholder="Add a comment… (⌘+Enter to send)"
            className="flex-1 resize-none rounded-lg border border-line bg-ink px-3 py-2 text-xs outline-none placeholder:text-zinc-600 focus:border-violet-500"/>
          <button disabled={!body.trim()} className="rounded-lg bg-violet-500 p-2.5 text-white disabled:opacity-40" title="Send"><Send size={15}/></button>
        </div>
      </form>
    </aside>
  </div>;
}
