import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Drawer } from './Drawer';

/**
 * The Drawer's enter/exit motion rides on `tw-animate-css`'s standard
 * `animate-in`/`animate-out` + `slide-*` / `fade-*` utilities (CREW-237),
 * replacing the bespoke `animate-drawer-*` / `animate-overlay-*` classes that
 * depended on hand-rolled keyframes in index.css. These render assertions guard
 * against silently regressing back to those now-removed inert classes.
 */
describe('Drawer', () => {
  it('animates its panel with the standard slide-from-right classes', () => {
    render(
      <Drawer open onOpenChange={() => {}} title="Test drawer">
        <p>body</p>
      </Drawer>,
    );

    const panel = screen.getByRole('dialog');
    expect(panel.className).toContain('data-[state=open]:animate-in');
    expect(panel.className).toContain('data-[state=closed]:animate-out');
    expect(panel.className).toContain('data-[state=open]:slide-in-from-right');
    expect(panel.className).toContain('data-[state=closed]:slide-out-to-right');
    expect(panel.className).not.toContain('animate-drawer');
  });

  it('fades its backdrop with the standard fade classes', () => {
    render(
      <Drawer open onOpenChange={() => {}} title="Test drawer">
        <p>body</p>
      </Drawer>,
    );

    const backdrop = screen.getByTestId('drawer-backdrop');
    expect(backdrop.className).toContain('data-[state=open]:animate-in');
    expect(backdrop.className).toContain('data-[state=open]:fade-in-0');
    expect(backdrop.className).toContain('data-[state=closed]:fade-out-0');
    expect(backdrop.className).not.toContain('animate-overlay');
  });
});
