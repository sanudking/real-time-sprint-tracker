/** Small formatting helpers shared by the board, cards and detail panel. */

export const timeAgo = (iso) => {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

/** Whole-day difference between a due date and today (negative = overdue). */
export const daysUntil = (iso) => {
  if (!iso) return null;
  const due = new Date(iso);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  return Math.round((startOfDue - startOfToday) / 86400000);
};

/** Due-date chip styling: overdue red, today/soon amber, later muted. */
export const dueMeta = (iso) => {
  const days = daysUntil(iso);
  if (days === null) return null;
  if (days < 0) return { days, label: `${Math.abs(days)}d overdue`, tone: 'border-rose-400/30 bg-rose-400/10 text-rose-300' };
  if (days === 0) return { days, label: 'Due today', tone: 'border-amber-400/30 bg-amber-400/10 text-amber-300' };
  if (days === 1) return { days, label: 'Due tomorrow', tone: 'border-amber-400/30 bg-amber-400/10 text-amber-300' };
  if (days <= 7) return { days, label: `${days}d left`, tone: 'border-sky-400/25 bg-sky-400/10 text-sky-300' };
  return { days, label: new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), tone: 'border-line text-zinc-400' };
};

/** `YYYY-MM-DD` for <input type="date">, or '' when there is no date. */
export const toDateInput = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');

/** Deterministic pastel per label, so "bug" is the same colour everywhere. */
const LABEL_TONES = [
  'border-violet-400/25 bg-violet-400/10 text-violet-300',
  'border-emerald-400/25 bg-emerald-400/10 text-emerald-300',
  'border-sky-400/25 bg-sky-400/10 text-sky-300',
  'border-amber-400/25 bg-amber-400/10 text-amber-300',
  'border-rose-400/25 bg-rose-400/10 text-rose-300',
  'border-teal-400/25 bg-teal-400/10 text-teal-300'
];

export const labelTone = (label) => {
  let hash = 0;
  for (let i = 0; i < label.length; i += 1) hash = (hash * 31 + label.charCodeAt(i)) % 997;
  return LABEL_TONES[hash % LABEL_TONES.length];
};

export const initials = (name = '') => name
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map(part => part[0].toUpperCase())
  .join('');
