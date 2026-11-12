import { MotionConfig, motion, useReducedMotion, type HTMLMotionProps } from 'motion/react';
import { createContext, useContext, useRef, useState, type ReactNode } from 'react';

const ReducedMotion = createContext(false);
export function PartyMotion({ reduced, children }: { reduced: boolean; children: ReactNode }) {
  return <ReducedMotion.Provider value={reduced}><MotionConfig reducedMotion={reduced ? 'always' : 'user'}>{children}</MotionConfig></ReducedMotion.Provider>;
}
export function usePartyMotion() {
  const reduced = useContext(ReducedMotion);
  const system = useReducedMotion();
  return reduced || system;
}

export function Button(props: HTMLMotionProps<'button'>) {
  const reduced = usePartyMotion();
  return <motion.button
    whileHover={props.disabled ? undefined : reduced ? { opacity: .85 } : { y: -3, rotate: -1, scale: 1.025 }}
    whileTap={props.disabled ? undefined : reduced ? { opacity: .7 } : { y: 2, rotate: 1, scale: .96 }}
    transition={{ type: 'spring', stiffness: 500, damping: 22 }}
    {...props}/>;
}

export function Screen(props: HTMLMotionProps<'main'>) {
  const reduced = usePartyMotion();
  return <motion.main initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12, scale: .985 }} animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }} transition={{ duration: reduced ? .08 : .18 }} {...props}/>;
}

export function Pager({ page, pages, onPage, label = 'players' }: {
  page: number; pages: number; onPage: (page: number) => void; label?: string;
}) {
  if (pages <= 1) return null;
  return <nav className="pager" aria-label={`${label} pages`}>
    <Button className="secondary" aria-label={`Previous ${label}`} disabled={page === 0} onClick={() => onPage(page - 1)}>&larr;</Button>
    <span>Page {page + 1} of {pages}</span>
    <Button className="secondary" aria-label={`Next ${label}`} disabled={page + 1 === pages} onClick={() => onPage(page + 1)}>&rarr;</Button>
  </nav>;
}

export function ToolsDialog({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  return <>
    <Button className="secondary tools-button" onClick={() => { ref.current?.showModal(); setOpen(true); }}>{label}</Button>
    <dialog ref={ref} className="tools-dialog" aria-label={label} onClose={() => setOpen(false)}>
      {open && <motion.div initial={{ scale: .9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
        <div className="dialog-heading"><h2>{label}</h2><Button className="secondary" aria-label={`Close ${label}`} onClick={() => ref.current?.close()}>Done</Button></div>
        {children}
      </motion.div>}
    </dialog>
  </>;
}
