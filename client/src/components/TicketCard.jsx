import { useDraggable } from '@dnd-kit/core';
import { MessageSquare, Trash2, UserRound } from 'lucide-react';
const priorities = { LOW: 'text-sky-300 bg-sky-400/10 border-sky-400/20', MEDIUM: 'text-amber-300 bg-amber-400/10 border-amber-400/20', HIGH: 'text-rose-300 bg-rose-400/10 border-rose-400/20' };
const next = { TODO: 'IN_PROGRESS', IN_PROGRESS: 'REVIEW', REVIEW: 'DONE', DONE: 'TODO' };

export default function TicketCard({ ticket, onOpen, onStatus, onDelete, canDelete = true, commentCount = 0, dragging = false }) {
  return <article className={`group cursor-grab rounded-xl border border-line bg-[#151519] p-3.5 transition hover:border-zinc-600 ${dragging ? 'opacity-40' : ''}`}>
    <div className="mb-3 flex items-start justify-between gap-2">
      <span className="font-mono text-[10px] text-zinc-500">#{String(ticket._id).slice(-6).toUpperCase()}</span>
      <div className="flex items-center gap-2">
        {commentCount > 0 && <span className="flex items-center gap-1 font-mono text-[10px] text-zinc-500"><MessageSquare size={11}/>{commentCount}</span>}
        {canDelete && <button onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onDelete(ticket._id); }} title="Delete ticket" className="text-zinc-600 opacity-0 transition hover:text-rose-400 group-hover:opacity-100"><Trash2 size={14}/></button>}
      </div>
    </div>
    <h3 className="text-sm font-semibold leading-5 text-zinc-100">{ticket.title}</h3>
    {ticket.description && <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-zinc-500">{ticket.description}</p>}
    <div className="mt-4 flex items-center justify-between gap-2">
      <span className={`rounded-md border px-2 py-1 font-mono text-[9px] font-semibold tracking-wide ${priorities[ticket.priority]}`}>{ticket.priority}</span>
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
