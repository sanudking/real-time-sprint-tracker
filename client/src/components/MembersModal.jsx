import { useState } from 'react';
import { Crown, Shield, ShieldOff, UserMinus } from 'lucide-react';
import api from '../api/axios';
import Modal from './Modal';
import { Field } from './Form';
import { initials } from '../utils/format';

export default function MembersModal({ workspace, isAdmin, currentUserId, onClose, onChange }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const members = workspace?.members || [];
  const ownerId = workspace?.owner?._id || workspace?.owner;

  const invite = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const { data } = await api.post(`/api/workspaces/${workspace._id}/members`, { email });
      onChange(data); setEmail('');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not add member');
    } finally { setBusy(false); }
  };

  const setRole = async (userId, role) => {
    setError('');
    try {
      const { data } = await api.patch(`/api/workspaces/${workspace._id}/members/${userId}`, { role });
      onChange(data);
    } catch (err) { setError(err.response?.data?.message || 'Could not change role'); }
  };

  const remove = async (userId) => {
    setError('');
    try {
      const { data } = await api.delete(`/api/workspaces/${workspace._id}/members/${userId}`);
      onChange(data);
    } catch (err) { setError(err.response?.data?.message || 'Could not remove member'); }
  };

  return <Modal title="Members" onClose={onClose}>
    {isAdmin && <form onSubmit={invite} className="mb-5 space-y-3 border-b border-line pb-5">
      <Field label="Invite by email" hint="They must already have an account.">
        <input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="teammate@company.com"/>
      </Field>
      <button disabled={busy} className="w-full rounded-lg bg-violet-500 py-2.5 text-sm font-semibold disabled:opacity-50">{busy ? 'Adding…' : 'Add member'}</button>
    </form>}

    {error && <p className="mb-3 text-xs text-rose-400">{error}</p>}

    <ul className="space-y-2">
      {members.map(({ user: m, role }) => {
        const isOwner = (ownerId || '') === m._id;
        const isSelf = m._id === currentUserId;
        return <li key={m._id} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-ink/60 px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-violet-500/15 font-mono text-[10px] font-semibold text-violet-200">{initials(m.name)}</span>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 truncate text-sm text-zinc-200">
                {m.name}{isSelf && <span className="text-[10px] text-zinc-600">(you)</span>}
                {isOwner && <Crown size={12} className="text-amber-400" title="Owner"/>}
              </p>
              <p className="truncate text-[11px] text-zinc-600">{m.email}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className={`rounded border px-1.5 py-0.5 font-mono text-[9px] ${role === 'ADMIN' ? 'border-violet-400/30 text-violet-300' : 'border-line text-zinc-500'}`}>{role}</span>
            {isAdmin && !isOwner && <button onClick={() => setRole(m._id, role === 'ADMIN' ? 'MEMBER' : 'ADMIN')} title={role === 'ADMIN' ? 'Demote to member' : 'Promote to admin'} className="text-zinc-500 hover:text-violet-300">{role === 'ADMIN' ? <ShieldOff size={14}/> : <Shield size={14}/>}</button>}
            {isAdmin && !isOwner && <button onClick={() => remove(m._id)} title="Remove from workspace" className="text-zinc-500 hover:text-rose-400"><UserMinus size={14}/></button>}
          </div>
        </li>;
      })}
    </ul>
    {!isAdmin && <p className="mt-4 text-[11px] text-zinc-600">Only workspace admins can manage members.</p>}
  </Modal>;
}
