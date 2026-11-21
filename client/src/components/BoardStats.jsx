import { AlertTriangle, CalendarClock, CheckCircle2, Flame, TrendingUp } from 'lucide-react';

const bar = 'h-1.5 rounded-full bg-white/5 overflow-hidden';

/**
 * Compact sprint health strip. Everything here is derived server-side so the
 * numbers match across devices and do not depend on client filters.
 */
export default function BoardStats({ stats }) {
  if (!stats) return null;

  const { total, byStatus, byPriority, points, completion, overdue, dueSoon, byAssignee } = stats;
  const done = byStatus.DONE || 0;

  const cards = [
    { label: 'Done', value: `${completion}%`, hint: `${done} of ${total}`, icon: CheckCircle2, tone: 'text-emerald-300' },
    { label: 'Overdue', value: overdue, hint: overdue ? 'needs attention' : 'all on track', icon: AlertTriangle, tone: overdue ? 'text-rose-300' : 'text-zinc-400' },
    { label: 'Due in 7d', value: dueSoon, hint: 'upcoming deadlines', icon: CalendarClock, tone: 'text-amber-300' },
    { label: 'Points', value: points.total, hint: `${points.done} delivered`, icon: TrendingUp, tone: 'text-violet-300' }
  ];

  return <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    {cards.map(({ label, value, hint, icon: Icon, tone }) => <div key={label} className="rounded-xl border border-line bg-panel p-4">
      <div className="flex items-start justify-between">
        <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">{label}</p>
        <Icon size={14} className={tone}/>
      </div>
      <p className="mt-2 text-2xl font-bold leading-none">{value}</p>
      <p className="mt-1.5 text-[11px] text-zinc-600">{hint}</p>
    </div>)}

    <div className="rounded-xl border border-line bg-panel p-4 sm:col-span-2 xl:col-span-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-zinc-500"><Flame size={12} className="text-violet-400"/> Workload</p>
        <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] text-zinc-500">
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-rose-400"/>high {byPriority.HIGH || 0}</span>
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-400"/>medium {byPriority.MEDIUM || 0}</span>
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-sky-400"/>low {byPriority.LOW || 0}</span>
        </div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {byAssignee.slice(0, 6).map(person => {
          const pct = person.total ? Math.round((person.done / person.total) * 100) : 0;
          return <div key={person.name} className="min-w-0">
            <div className="flex items-baseline justify-between gap-2 text-[11px]">
              <span className="truncate text-zinc-300">{person.name}</span>
              <span className="shrink-0 font-mono text-zinc-600">{person.done}/{person.total}{person.points ? ` · ${person.points}p` : ''}</span>
            </div>
            <div className={`mt-1.5 ${bar}`}><div className="h-full rounded-full bg-violet-500/70" style={{ width: `${pct}%` }}/></div>
          </div>;
        })}
        {byAssignee.length === 0 && <p className="text-[11px] text-zinc-600">No tickets yet — workload appears once work is assigned.</p>}
      </div>
    </div>
  </section>;
}
