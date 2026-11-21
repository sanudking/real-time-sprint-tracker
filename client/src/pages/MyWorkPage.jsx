import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CalendarClock, CircleAlert, Layers3, ListTodo } from 'lucide-react';
import api from '../api/axios';
import { dueMeta } from '../utils/format';

const statusTone = {
  TODO: 'border-line text-zinc-400',
  IN_PROGRESS: 'border-sky-400/25 bg-sky-400/10 text-sky-300',
  REVIEW: 'border-amber-400/25 bg-amber-400/10 text-amber-300',
  DONE: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300'
};

/** Cross-workspace list of everything assigned to the signed-in user. */
export default function MyWorkPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api.get('/api/workspaces/my-work')
      .then(({ data: payload }) => { if (alive) setData(payload); })
      .catch(e => { if (alive) setError(e.response?.data?.message || 'Could not load your work'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const tickets = data?.tickets || [];
  const counts = data?.counts || { total: 0, open: 0, overdue: 0 };
  const open = tickets.filter(t => t.status !== 'DONE');
  const done = tickets.filter(t => t.status === 'DONE');

  return <main className="min-h-screen">
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-4">
        <Link to="/workspaces" className="text-zinc-500 hover:text-white"><ArrowLeft size={18}/></Link>
        <div className="h-5 w-px bg-line"/>
        <p className="text-sm font-semibold">My work</p>
      </div>
    </header>

    <section className="mx-auto max-w-5xl px-6 py-10">
      <p className="font-mono text-[10px] uppercase tracking-[.2em] text-violet-400">Across all workspaces</p>
      <h1 className="mt-2 text-2xl font-bold">Assigned to you</h1>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {[{ label: 'Open', value: counts.open, icon: ListTodo, tone: 'text-violet-300' },
          { label: 'Overdue', value: counts.overdue, icon: CircleAlert, tone: counts.overdue ? 'text-rose-300' : 'text-zinc-400' },
          { label: 'Completed', value: done.length, icon: CalendarClock, tone: 'text-emerald-300' }].map(({ label, value, icon: Icon, tone }) =>
          <div key={label} className="rounded-xl border border-line bg-panel p-4">
            <div className="flex items-center justify-between"><p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">{label}</p><Icon size={14} className={tone}/></div>
            <p className="mt-2 text-2xl font-bold leading-none">{value}</p>
          </div>)}
      </div>

      {error && <p className="mt-6 text-sm text-rose-400">{error}</p>}

      {loading ? <div className="mt-8 space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-14 animate-pulse rounded-lg border border-line bg-panel"/>)}</div>
        : <div className="mt-8 space-y-6">
          {open.length === 0 && <div className="rounded-xl border border-dashed border-line py-14 text-center">
            <ListTodo className="mx-auto text-zinc-600" size={26}/>
            <p className="mt-3 text-sm text-zinc-400">Nothing assigned to you</p>
            <p className="mt-1 text-xs text-zinc-600">Pick something up from a board to see it here.</p>
          </div>}

          {[['Open', open], ['Completed', done]].map(([title, list]) => list.length > 0 && <div key={title}>
            <h2 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-zinc-500">{title} · {list.length}</h2>
            <ul className="space-y-2">
              {list.map(t => {
                const due = t.status !== 'DONE' ? dueMeta(t.dueDate) : null;
                return <li key={t._id}>
                  <Link to={`/workspace/${t.workspace?._id || t.workspace}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-panel px-4 py-3 transition hover:border-violet-500/50">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-zinc-200">{t.title}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-600"><Layers3 size={11}/>{t.workspace?.name || 'Workspace'}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {due && <span className={`rounded border px-1.5 py-0.5 font-mono text-[9px] ${due.tone}`}>{due.label}</span>}
                      <span className={`rounded border px-1.5 py-0.5 font-mono text-[9px] ${statusTone[t.status]}`}>{t.status.replace('_', ' ')}</span>
                    </div>
                  </Link>
                </li>;
              })}
            </ul>
          </div>)}
        </div>}
    </section>
  </main>;
}
