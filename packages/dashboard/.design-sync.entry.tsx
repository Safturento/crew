// design-sync bundle entry — the DS surface synced to claude.ai/design.
// Explicit re-exports so the bundle carries only design-system components,
// not the whole app; ui/form.tsx is deliberately absent (its react-hook-form
// FormField glue collides with the FormField composite below).
import * as React from 'react';

// Theme root for preview cards (cfg.provider) and for anyone composing with
// the bundle: the dashboard ships dark-only at runtime. The `dark` class MUST
// land on <html> — Tailwind v4 registers theme vars with @property, so
// `--color-*` references substitute at :root; a `.dark` on any descendant is
// too late and everything renders light-mode.
export function DarkThemeRoot({ children }: { children?: React.ReactNode }) {
  React.useLayoutEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);
  return (
    <div
      style={{
        background: 'var(--color-background)',
        color: 'var(--color-foreground)',
        fontFamily: 'var(--font-sans), sans-serif',
        padding: 16,
        minHeight: '100%',
        boxSizing: 'border-box',
      }}
    >
      {children}
    </div>
  );
}

// Re-exported so previews can wrap data-bound components (DrawerHeader, TopNav)
// in a QueryClientProvider whose context identity matches the react-query copy
// bundled inside _ds_bundle.js — an instance imported from node_modules is a
// second module and its context never matches.
export { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export * from './src/components/ui/badge';
export * from './src/components/ui/button';
export * from './src/components/ui/checkbox';
export * from './src/components/ui/dialog';
export * from './src/components/ui/alert-dialog';
export * from './src/components/ui/input';
export * from './src/components/ui/label';
export * from './src/components/ui/meta-list';
export * from './src/components/ui/pill-base';
export * from './src/components/ui/popover';
export * from './src/components/ui/separator';
export * from './src/components/ui/state-icon';
export * from './src/components/ui/switch';
export * from './src/components/ui/tag';
export * from './src/components/Modal';
export * from './src/components/AlertModal';
export * from './src/components/ModalSelectionRow';
export * from './src/components/FormField';
export * from './src/components/Stepper';
export * from './src/components/Drawer';
export * from './src/components/DrawerHeader';
export * from './src/components/TopNav';
export * from './src/components/BrandMark';
