import { useCallback, useEffect, useRef, useState } from 'react';

export const OTP_RESEND_COOLDOWN_SECONDS = 30;

/** Countdown before OTP resend is allowed again (default 30s). */
export function useOtpResendCooldown(seconds = OTP_RESEND_COOLDOWN_SECONDS) {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startCooldown = useCallback(() => {
    clearTimer();
    setSecondsLeft(seconds);
    intervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearTimer();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [clearTimer, seconds]);

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
