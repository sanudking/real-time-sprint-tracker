import { useDraggable } from '@dnd-kit/core';
import { Check, CheckSquare, MessageSquare, Trash2, UserRound } from 'lucide-react';
import { dueMeta, labelTone } from '../utils/format';

const priorities = { LOW: 'text-sky-300 bg-sky-400/10 border-sky-400/20', MEDIUM: 'text-amber-300 bg-amber-400/10 border-amber-400/20', HIGH: 'text-rose-300 bg-rose-400/10 border-rose-400/20' };
const next = { TODO: 'IN_PROGRESS', IN_PROGRESS: 'REVIEW', REVIEW: 'DONE', DONE: 'TODO' };

export default function TicketCard({ ticket, onOpen, onStatus, onDelete, canDelete = true, commentCount = 0, dragging = false, selected = false, onToggleSelect }) {
  const due = dueMeta(ticket.dueDate);
  const subtasks = ticket.subtasks || [];
  const subtasksDone = subtasks.filter(s => s.done).length;
  const labels = ticket.labels || [];

  return <article className={`group relative cursor-grab rounded-xl border bg-[#151519] p-3.5 transition hover:border-zinc-600 ${selected ? 'border-violet-500/70 ring-1 ring-violet-500/30' : 'border-line'} ${dragging ? 'opacity-40' : ''}`}>
    <div className="mb-2 flex items-start justify-between gap-2">
      <div className="flex items-center gap-2">
        {onToggleSelect && <button
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onToggleSelect(ticket._id); }}
          title={selected ? 'Deselect ticket' : 'Select ticket'}
          className={`grid h-4 w-4 shrink-0 place-items-center rounded border transition ${selected ? 'border-violet-400 bg-violet-500 text-white' : 'border-zinc-600 text-transparent hover:border-zinc-400'}`}>
          <Check size={11} strokeWidth={3}/>
        </button>}
        <span className="font-mono text-[10px] text-zinc-500">#{String(ticket._id).slice(-6).toUpperCase()}</span>
      </div>
      <div className="flex items-center gap-2">
        {ticket.points > 0 && <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[9px] text-zinc-400" title="Story points">{ticket.points}p</span>}
        {commentCount > 0 && <span className="flex items-center gap-1 font-mono text-[10px] text-zinc-500"><MessageSquare size={11}/>{commentCount}</span>}
        {canDelete && <button onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onDelete(ticket._id); }} title="Delete ticket" className="text-zinc-600 opacity-0 transition hover:text-rose-400 group-hover:opacity-100"><Trash2 size={14}/></button>}
      </div>
    </div>

    <h3 className="text-sm font-semibold leading-5 text-zinc-100">{ticket.title}</h3>
    {ticket.description && <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-zinc-500">{ticket.description}</p>}

    {labels.length > 0 && <div className="mt-2.5 flex flex-wrap gap-1">
      {labels.slice(0, 3).map(label => <span key={label} className={`rounded border px-1.5 py-0.5 font-mono text-[9px] ${labelTone(label)}`}>{label}</span>)}
      {labels.length > 3 && <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[9px] text-zinc-500">+{labels.length - 3}</span>}
    </div>}

    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      <span className={`rounded-md border px-2 py-1 font-mono text-[9px] font-semibold tracking-wide ${priorities[ticket.priority]}`}>{ticket.priority}</span>
      {due && <span className={`rounded-md border px-2 py-1 font-mono text-[9px] font-semibold ${due.tone}`}>{due.label}</span>}
      {subtasks.length > 0 && <span className={`flex items-center gap-1 rounded-md border px-2 py-1 font-mono text-[9px] ${subtasksDone === subtasks.length ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' : 'border-line text-zinc-400'}`}>
        <CheckSquare size={10}/>{subtasksDone}/{subtasks.length}
      </span>}
    </div>

    <div className="mt-3 flex items-center justify-between gap-2">
      <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-zinc-400"><UserRound size={12}/><span className="max-w-24 truncate">{ticket.assignedTo?.name || 'Unassigned'}</span></span>
    </div>

    <div className="mt-3 flex items-center gap-2">
      <button onClick={e => { e.stopPropagation(); onOpen(ticket); }} className="flex-1 rounded-lg border border-line py-1.5 text-[10px] text-zinc-400 transition hover:border-accent/60 hover:text-violet-300">Open</button>
      <button onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onStatus(ticket._id, next[ticket.status]); }} title={`Move to ${next[ticket.status].replace('_', ' ')}`} className="rounded-lg border border-line px-2 py-1.5 text-[10px] text-zinc-400 transition hover:border-accent/60 hover:text-violet-300">→</button>
    </div>
  </article>;
}

/** Draggable wrapper: the card stays presentational. */
export function DraggableTicket(props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: props.ticket._id });
  return <div ref={setNodeRef} {...listeners} {...attributes} style={{ touchAction: 'none' }}>
    <TicketCard {...props} dragging={isDragging} />
  </div>;
}
