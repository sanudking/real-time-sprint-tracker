import { X } from 'lucide-react';
export default function Modal({ title, onClose, children }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <div className="w-full max-w-lg rounded-2xl border border-line bg-panel shadow-2xl">
      <div className="flex items-center justify-between border-b border-line px-5 py-4"><h2 className="font-semibold">{title}</h2><button onClick={onClose} className="text-zinc-400 hover:text-white"><X size={18}/></button></div>
      <div className="p-5">{children}</div>
    </div>
  </div>;
}
