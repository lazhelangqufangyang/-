import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';

type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** 保存中等情况下不允许关闭面板 */
  closeDisabled?: boolean;
  children: ReactNode;
};

/**
 * 页面里所有底部弹层共用的一层壳：
 * 遮罩、进出场动画、Esc 关闭、锁定背景滚动、焦点移入与归还。
 */
export default function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  closeDisabled = false,
  children,
}: BottomSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  const closeDisabledRef = useRef(closeDisabled);
  const reduceMotion = useReducedMotion();
  const titleId = useId();

  useEffect(() => {
    closeRef.current = onClose;
    closeDisabledRef.current = closeDisabled;
  });

  useEffect(() => {
    if (!open) return undefined;

    lastFocused.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || closeDisabledRef.current) return;
      event.preventDefault();
      closeRef.current();
    };

    window.addEventListener('keydown', onKeyDown);
    // 等进场动画开始后再移焦点，读屏不会读到还在屏幕外的内容
    const focusTimer = window.setTimeout(() => panelRef.current?.focus(), 80);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      lastFocused.current?.focus?.();
    };
  }, [open]);

  /** 面板内 Tab 循环，避免焦点跑到背后的页面上 */
  const trapTab = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const root = panelRef.current;
    if (!root) return;

    const focusable = Array.from(
      root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((node) => node.offsetParent !== null || node === document.activeElement);

    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

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
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 backdrop-blur-sm"
          onClick={closeDisabled ? undefined : onClose}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={trapTab}
            initial={reduceMotion ? { opacity: 0 } : { y: '100%' }}
            animate={reduceMotion ? { opacity: 1 } : { y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { y: '100%' }}
            transition={
              reduceMotion
                ? { duration: 0.15 }
                : { type: 'spring', stiffness: 280, damping: 30 }
            }
            className="w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl bg-white px-5 pt-3 shadow-2xl outline-none"
            style={{
              maxHeight: '88dvh',
              paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
            }}
          >
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-gray-200" />

            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 id={titleId} className="text-xl font-black tracking-tight text-gray-900">
                  {title}
                </h2>
                {subtitle && <p className="mt-1 text-xs text-gray-400">{subtitle}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={closeDisabled}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-all disabled:opacity-40 active:scale-95"
                aria-label="关闭"
              >
                <X size={17} />
              </button>
            </div>

            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
