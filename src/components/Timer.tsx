import { useState, useEffect } from 'react';

interface TimerProps {
  endTime: number;
  onExpire?: () => void;
  className?: string;
}

export default function Timer({ endTime, onExpire, className = '' }: TimerProps) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const update = () => {
      const diff = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
      setRemaining(diff);
      if (diff === 0 && onExpire) onExpire();
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [endTime, onExpire]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const isWarning = remaining <= 60 && remaining > 0;

  return (
    <span className={`font-mono text-2xl font-bold ${isWarning ? 'text-red-400 animate-pulse' : 'text-emerald-400'} ${className}`}>
      {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
    </span>
  );
}
