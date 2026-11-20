import type { ReactNode } from 'react';
import { X, Sparkles } from 'lucide-react';

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <section className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-head"><div><p className="eyebrow">CAMPORA</p><h2>{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
      {children}
    </section>
  </div>;
}

export function SectionTitle({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return <div className="section-title"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2>{title}</h2></div>{action}</div>;
}

export function EmptyState({ title, text, icon }: { title: string; text: string; icon?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon">{icon || <Sparkles size={20} />}</div><h3>{title}</h3><p>{text}</p></div>;
}

export function Tag({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'success' | 'warning' }) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}

export function Button({ children, onClick, variant = 'primary', type = 'button', disabled = false }: { children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'ghost'; type?: 'button' | 'submit'; disabled?: boolean }) {
  return <button type={type} disabled={disabled} className={`button button-${variant}`} onClick={onClick}>{children}</button>;
}
