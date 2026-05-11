import type { ReactNode } from 'react';

export function ViewportFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full justify-center bg-background p-6">
      <div className="flex w-full max-w-7xl flex-col overflow-hidden rounded-lg bg-card shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] ring-1 ring-white/5">
        {children}
      </div>
    </div>
  );
}
