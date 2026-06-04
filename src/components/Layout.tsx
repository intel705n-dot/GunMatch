import type { ReactNode } from 'react';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#FAF9F7] text-stone-900">
      <div className="max-w-lg mx-auto px-4 py-6">
        {children}
      </div>
    </div>
  );
}
