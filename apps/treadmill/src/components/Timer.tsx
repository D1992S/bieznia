import { useState, useRef, useCallback, useEffect } from 'react';
import { formatDuration } from '../utils/date-utils.ts';

interface TimerProps {
  onSessionEnd: (durationSeconds: number, startTime: string, endTime: string) => void;
}

type TimerState = 'idle' | 'running' | 'paused';

export function Timer({ onSessionEnd }: TimerProps) {
  const [seconds, setSeconds] = useState(0);
  const [state, setState] = useState<TimerState>('idle');
  const [startTime, setStartTime] = useState<string>('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    return clearTimer;
  }, [clearTimer]);

  const handleStart = () => {
    if (state === 'idle') {
      setStartTime(new Date().toISOString());
    }
    setState('running');
    intervalRef.current = setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);
  };

  const handlePause = () => {
    clearTimer();
    setState('paused');
  };

  const handleStop = () => {
    clearTimer();
    if (seconds > 0) {
      onSessionEnd(seconds, startTime, new Date().toISOString());
    }
    setState('idle');
    setSeconds(0);
    setStartTime('');
  };

  const handleReset = () => {
    clearTimer();
    setState('idle');
    setSeconds(0);
    setStartTime('');
  };

  return (
    <div className="card">
      <div className="card-title">Stoper</div>
      <div className="timer-display">{formatDuration(seconds)}</div>
      <div className="timer-controls">
        {state === 'idle' && (
          <button className="timer-btn start" onClick={handleStart}>
            Start
          </button>
        )}
        {state === 'running' && (
          <>
            <button className="timer-btn pause" onClick={handlePause}>
              Pauza
            </button>
            <button className="timer-btn stop" onClick={handleStop}>
              Zakoncz
            </button>
          </>
        )}
        {state === 'paused' && (
          <>
            <button className="timer-btn start" onClick={handleStart}>
              Wznow
            </button>
            <button className="timer-btn stop" onClick={handleStop}>
              Zakoncz
            </button>
            <button className="timer-btn reset" onClick={handleReset}>
              Reset
            </button>
          </>
        )}
      </div>
    </div>
  );
}
