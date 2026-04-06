import { useRef, useState, type ReactNode } from 'react';

interface SwipeToDeleteProps {
  children: ReactNode;
  onDelete: () => void;
  disabled?: boolean;
}

export default function SwipeToDelete({ children, onDelete, disabled }: SwipeToDeleteProps) {
  const startX = useRef(0);
  const currentX = useRef(0);
  const [offsetX, setOffsetX] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);
  const dragging = useRef(false);

  const threshold = -80;

  const handleTouchStart = (e: React.TouchEvent) => {
    if (disabled) return;
    startX.current = e.touches[0].clientX;
    currentX.current = 0;
    dragging.current = true;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current) return;
    const diff = e.touches[0].clientX - startX.current;
    const clamped = Math.min(0, Math.max(-120, diff));
    currentX.current = clamped;
    setOffsetX(clamped);
  };

  const handleTouchEnd = () => {
    if (!dragging.current) return;
    dragging.current = false;
    if (currentX.current < threshold) {
      setShowConfirm(true);
      setOffsetX(threshold);
    } else {
      setOffsetX(0);
      setShowConfirm(false);
    }
  };

  const handleConfirmDelete = () => {
    if (!confirm('この大会を削除しますか？この操作は元に戻せません。')) return;
    onDelete();
    setOffsetX(0);
    setShowConfirm(false);
  };

  const handleCancel = () => {
    setOffsetX(0);
    setShowConfirm(false);
  };

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Delete background (mobile swipe) */}
      <div className="absolute inset-y-0 right-0 flex items-center bg-red-600 rounded-r-xl">
        {showConfirm ? (
          <button
            onClick={handleConfirmDelete}
            className="px-4 h-full text-sm font-bold text-white whitespace-nowrap"
          >
            削除する
          </button>
        ) : (
          <span className="px-4 text-sm font-bold text-white/70">削除</span>
        )}
      </div>

      {/* Swipeable content */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={() => { if (showConfirm) handleCancel(); }}
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: dragging.current ? 'none' : 'transform 0.2s ease-out',
        }}
        className="relative z-10"
      >
        {children}
      </div>
    </div>
  );
}
