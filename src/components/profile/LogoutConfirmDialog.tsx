import { useEffect, useId, useRef, type KeyboardEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Loader2, LogOut } from 'lucide-react';

type LogoutConfirmDialogProps = {
  open: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/** 退出登录前的二次确认：默认焦点落在「再想想」，避免误触 */
export default function LogoutConfirmDialog({
  open,
  busy = false,
  onCancel,
  onConfirm,
}: LogoutConfirmDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);
  const onCancelRef = useRef(onCancel);
  const reduceMotion = useReducedMotion();
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    onCancelRef.current = onCancel;
  });

  useEffect(() => {
    if (!open) return undefined;

    lastFocused.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault();
        onCancelRef.current();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    const focusTimer = window.setTimeout(() => cancelRef.current?.focus(), 60);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      lastFocused.current?.focus?.();
    };
  }, [open, busy]);

  /** 两个按钮之间循环 Tab，焦点不落到背后的页面 */
  const trapFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const root = panelRef.current;
    if (!root) return;
    const buttons = Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled])'));
    if (!buttons.length) return;
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 px-6 backdrop-blur-sm"
          onClick={busy ? undefined : onCancel}
        >
          <motion.div
            ref={panelRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descId}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 8 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 6 }}
            transition={reduceMotion ? { duration: 0.15 } : { type: 'spring', stiffness: 320, damping: 26 }}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={trapFocus}
            className="w-full max-w-[320px] rounded-3xl bg-white p-5 shadow-2xl outline-none"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-red-500">
              <LogOut size={20} strokeWidth={2} />
            </div>

            <h2 id={titleId} className="mt-4 text-lg font-black tracking-tight text-gray-900">
              退出登录？
            </h2>
            <p id={descId} className="mt-2 text-xs leading-relaxed text-gray-500">
              退出后会回到游客状态，本机训练记录仍会保留。下次登录可以继续同步云端档案与荣誉。
            </p>

            <div className="mt-5 flex gap-2.5">
              <button
                ref={cancelRef}
                type="button"
                disabled={busy}
                onClick={onCancel}
                className="h-11 flex-1 rounded-xl bg-gray-100 text-xs font-bold text-gray-600 transition-transform disabled:opacity-50 active:scale-[0.98]"
              >
                再想想
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onConfirm}
                className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#E63946] text-xs font-bold text-white shadow-[0_6px_16px_rgba(230,57,70,0.22)] transition-transform disabled:opacity-50 active:scale-[0.98]"
              >
                {busy && <Loader2 size={14} className="animate-spin" />}
                {busy ? '退出中…' : '退出登录'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
