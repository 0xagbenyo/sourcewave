import { useCallback, useEffect, useRef, useState } from 'react';

export const OTP_RESEND_COOLDOWN_SECONDS = 60;

/** Countdown before OTP resend is allowed again (default 60s). */
export function useOtpResendCooldown(seconds = OTP_RESEND_COOLDOWN_SECONDS) {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startCooldown = useCallback(
    (fromSeconds = seconds) => {
      clearTimer();
      const initial = Math.max(0, Math.floor(fromSeconds));
      if (initial <= 0) {
        setSecondsLeft(0);
        return;
      }
      setSecondsLeft(initial);
      intervalRef.current = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            clearTimer();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    },
    [clearTimer, seconds]
  );

  const resetCooldown = useCallback(() => {
    clearTimer();
    setSecondsLeft(0);
  }, [clearTimer]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  return {
    secondsLeft,
    canResend: secondsLeft === 0,
    startCooldown,
    resetCooldown,
  };
}
