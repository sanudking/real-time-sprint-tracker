import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AtSign, Bell, BellRing, CheckCheck, MessageSquare, UserPlus, X } from 'lucide-react';
import api from '../api/axios';
import { useRealtime } from '../context/RealtimeContext';
import { timeAgo } from '../utils/format';

const icons = {
  ASSIGNED: UserPlus,
  MENTION: AtSign,
  COMMENT: MessageSquare
};

/**
 * Inbox of assignment / mention / comment pings. Reads once over REST, then
 * keeps itself current from the personal socket room.
 */
export default function NotificationBell() {
  const { socket } = useRealtime();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const panelRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/api/notifications');
      setItems(data.notifications);
      setUnread(data.unread);
    } catch { /* silent: the bell is not critical to using the board */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!socket) return;
    const onNew = ({ notification }) => {
      setItems(old => old.some(n => n._id === notification._id) ? old : [notification, ...old].slice(0, 30));
      setUnread(n => n + 1);
    };
    socket.on('notification:created', onNew);
    return () => socket.off('notification:created', onNew);
  }, [socket]);

  // Close on outside click / Escape, like every other popover.
  useEffect(() => {
    if (!open) return;
    const onDown = e => { if (!panelRef.current?.contains(e.target)) setOpen(false); };
    const onKey = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const markAllRead = async () => {
    setUnread(0);
    setItems(old => old.map(n => ({ ...n, read: true })));
    try { await api.post('/api/notifications/read'); } catch { load(); }
  };

  const dismiss = async (id) => {
    setItems(old => old.filter(n => n._id !== id));
    try { await api.delete(`/api/notifications/${id}`); } catch { load(); }
  };

  const openNotification = async (n) => {
    setOpen(false);
    if (!n.read) {
      setItems(old => old.map(x => (x._id === n._id ? { ...x, read: true } : x)));
      setUnread(u => Math.max(0, u - 1));
      api.patch(`/api/notifications/${n._id}/read`).catch(() => {});
    }
    if (n.workspace) navigate(`/workspace/${n.workspace}`);
  };

  const label = useMemo(() => (unread > 9 ? '9+' : String(unread)), [unread]);

  return <div className="relative" ref={panelRef}>
    <button onClick={() => setOpen(o => !o)} title="Notifications"
      className={`relative rounded-lg border px-2.5 py-2 transition ${open ? 'border-violet-500/50 text-violet-300' : 'border-line text-zinc-300 hover:border-zinc-500'}`}>
      {unread > 0 ? <BellRing size={15}/> : <Bell size={15}/>}
      {unread > 0 && <span className="absolute -right-1.5 -top-1.5 min-w-[16px] rounded-full bg-violet-500 px-1 text-center font-mono text-[9px] font-bold leading-4 text-white">{label}</span>}
    </button>

    {open && <div className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-xl border border-line bg-panel shadow-2xl">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-300">Notifications</p>
        {unread > 0 && <button onClick={markAllRead} className="flex items-center gap-1 text-[11px] text-violet-300 hover:text-violet-200"><CheckCheck size={12}/> Mark all read</button>}
      </div>
      <div className="max-h-80 overflow-y-auto">
        {loading && <p className="px-4 py-6 text-center text-xs text-zinc-600">Loading…</p>}
        {!loading && items.length === 0 && <p className="px-4 py-8 text-center text-xs text-zinc-600">You're all caught up.</p>}
        {items.map(n => {
          const Icon = icons[n.type] || Bell;
          return <div key={n._id} className={`group flex gap-2.5 border-b border-line/60 px-4 py-3 last:border-0 hover:bg-white/[.03] ${n.read ? '' : 'bg-violet-500/[.06]'}`}>
            <span className="mt-0.5 text-violet-300"><Icon size={14}/></span>
            <button onClick={() => openNotification(n)} className="min-w-0 flex-1 text-left">
              <p className="text-xs leading-5 text-zinc-200">{n.message}</p>
              <p className="mt-0.5 font-mono text-[10px] text-zinc-600">{timeAgo(n.createdAt)}</p>
            </button>
            <button onClick={() => dismiss(n._id)} title="Dismiss" className="self-start text-zinc-700 opacity-0 transition hover:text-rose-400 group-hover:opacity-100"><X size={12}/></button>
          </div>;
        })}
      </div>
    </div>}
  </div>;
}
