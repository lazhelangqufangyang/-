import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Sparkles, Trophy } from 'lucide-react';
import { MatchaPowderReveal } from '../ui/MatchaPowderReveal';
import { apiRequest, getErrorMessage } from '../api/client';

type RewardModalProps = {
  open: boolean;
  onClose: () => void;
  badgeId?: string;
  badgeName?: string;
  onClaim?: (badgeName: string) => void;
};

export default function RewardModal({
  open,
  onClose,
  badgeId,
  badgeName,
  onClaim,
}: RewardModalProps) {
  const [showBadge, setShowBadge] = useState(false);
  const [progress, setProgress] = useState(0);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState('');

  useEffect(() => {
    if (!open) return;
    setShowBadge(false);
    setProgress(0);
    setClaiming(false);
    setClaimError('');
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open || showBadge) return undefined;
    // 兜底：用户 3.5 秒内没有完成撕开，也自动揭晓勋章。
    const timer = window.setTimeout(() => setShowBadge(true), 3500);
    return () => window.clearTimeout(timer);
  }, [open, showBadge]);

  const claimBadge = async () => {
    if (claiming || (!badgeId && !badgeName)) return;
    setClaiming(true);
    setClaimError('');

    try {
      await apiRequest<unknown>('/users/me/badges', {
        method: 'POST',
        body: JSON.stringify({
          badgeId,
          badgeName,
        }),
      });
      onClaim?.(badgeName ?? '');
      onClose?.();
    } catch (error) {
      setClaimError(getErrorMessage(error) || '领取徽章失败，请稍后重试');
    } finally {
      setClaiming(false);
    }
  };

  const canClaim = Boolean(badgeId || badgeName);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[999] flex flex-col items-center justify-center overflow-hidden bg-black/95"
          role="dialog"
          aria-modal="true"
          aria-label="训练完成奖励"
        >
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at 50% 38%, #281117 0%, #0c0d10 48%, #000000 100%)',
            }}
          />

          <div className="relative flex h-[700px] w-full max-w-3xl items-center justify-center">
            <MatchaPowderReveal
              minimal
              height={700}
              onProgress={(value: number) => {
                setProgress(value);
                if (value >= 0.99) setShowBadge(true);
              }}
              className="w-full"
            />

            <AnimatePresence>
              {showBadge && (
                <motion.div
                  initial={{ scale: 0, opacity: 0, y: 50 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.85, opacity: 0, y: 20 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                  className="absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center"
                  style={{
                    background:
                      'radial-gradient(circle at center, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.72) 66%, rgba(0,0,0,0.9) 100%)',
                  }}
                >
                  <div className="relative mb-7">
                    <Sparkles size={24} className="absolute -left-12 top-4 text-yellow-200/80" />
                    <Sparkles size={18} className="absolute -right-11 bottom-8 text-yellow-300/70" />
                    <motion.div
                      initial={{ rotate: -12, scale: 0.8 }}
                      animate={{ rotate: 0, scale: 1 }}
                      transition={{ type: 'spring', stiffness: 180, damping: 12, delay: 0.08 }}
                      className="flex h-40 w-40 items-center justify-center rounded-full border border-yellow-100/70 bg-gradient-to-br from-yellow-200 via-yellow-400 to-yellow-700 shadow-[0_0_60px_rgba(255,215,0,0.45),inset_0_2px_0_rgba(255,255,255,0.8)] ring-8 ring-yellow-300/10"
                    >
                      <Trophy size={62} strokeWidth={1.5} className="text-amber-900 drop-shadow-sm" />
                    </motion.div>
                  </div>

                  <h2 className="mb-2 text-3xl font-black tracking-widest text-white">训练完成！</h2>
                  <p className="mb-8 text-sm text-gray-300">
                    恭喜完成训练！
                    {badgeName && (
                      <span className="mt-1 block text-xs text-gray-400">
                        获得徽章：{badgeName}
                      </span>
                    )}
                  </p>

                  {claimError && (
                    <p className="mb-3 max-w-xs text-center text-[11px] font-medium text-red-400" role="alert">
                      {claimError}
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      if (!canClaim) {
                        onClose?.();
                        return;
                      }
                      void claimBadge();
                    }}
                    disabled={claiming}
                    className="flex items-center gap-2 rounded-full bg-white px-12 py-4 text-lg font-bold text-black transition-all hover:scale-105 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60 active:scale-95"
                  >
                    {claiming && <Loader2 size={19} className="animate-spin" />}
                    {!canClaim ? '完成' : claiming ? '保存中...' : '收下徽章'}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {!showBadge && (
            <div className="pointer-events-none absolute bottom-16 left-0 right-0 text-center">
              <p className="animate-pulse text-sm text-gray-400">向左滑动撕开包装获取奖励...</p>
              {progress > 0 && (
                <p className="mt-2 text-[11px] font-medium text-[#E63946]">
                  已撕开 {Math.round(progress * 100)}%
                </p>
              )}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
