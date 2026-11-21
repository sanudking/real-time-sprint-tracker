import React from 'react';

/** Shared input styling used by every form in the app. */
export const inputClass = 'w-full rounded-lg border border-line bg-ink px-3 py-2.5 text-sm outline-none transition placeholder:text-zinc-600 focus:border-violet-500';

export function Field({ label, hint, children }) {
  return <label className="block">
    <span className="mb-1.5 block text-xs font-medium text-zinc-400">{label}</span>
    {React.cloneElement(children, { className: `${inputClass} ${children.props.className || ''}`.trim() })}
    {hint && <span className="mt-1 block text-[11px] text-zinc-600">{hint}</span>}
  </label>;
}

/**
 * Select with a disabled placeholder so the empty state reads as an
 * instruction ("Select priority…") instead of a blank box.
 */
export function SelectField({ label, value, onChange, placeholder = 'Select…', options, hint, allowEmpty }) {
  return <Field label={label} hint={hint}>
    <select value={value} onChange={onChange}>
      <option value="" disabled={!allowEmpty}>{placeholder}</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </Field>;
}

export const PRIORITY_OPTIONS = [
  { value: 'LOW', label: 'Low — nice to have' },
  { value: 'MEDIUM', label: 'Medium — normal' },
  { value: 'HIGH', label: 'High — blocking' }
];

export const STATUS_OPTIONS = [
  { value: 'TODO', label: 'To do' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'REVIEW', label: 'In review' },
  { value: 'DONE', label: 'Done' }
];
