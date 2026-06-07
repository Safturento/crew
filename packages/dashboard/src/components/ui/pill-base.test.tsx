import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PillBase } from './pill-base';

describe('PillBase', () => {
  it('renders the supplied element tag (span by default, button when as="button")', () => {
    const { rerender } = render(<PillBase shape="h-5 px-2">label</PillBase>);
    expect(screen.getByText('label').tagName).toBe('SPAN');

    rerender(
      <PillBase as="button" shape="h-8 px-3">
        label
      </PillBase>,
    );
    expect(screen.getByText('label').tagName).toBe('BUTTON');
  });

  it('applies shape, surface, and base layout classes', () => {
    render(
      <PillBase color="running" intensity="mid" shape="h-5 rounded-full px-2 font-mono text-xs">
        running
      </PillBase>,
    );
    const el = screen.getByText('running');
    expect(el.className).toContain('inline-flex');
    expect(el.className).toContain('items-center');
    expect(el.className).toContain('h-5');
    expect(el.className).toContain('rounded-full');
    expect(el.className).toMatch(/bg-slate-\d+/);
    expect(el.className).toMatch(/border-slate-\d+/);
  });

  it('renders the icon slot before children when icon is provided', () => {
    render(
      <PillBase shape="h-5 px-2" icon={<svg data-testid="icon" />}>
        label
      </PillBase>,
    );
    const el = screen.getByText('label');
    expect(el.querySelector('[data-testid="icon"]')).not.toBeNull();
    expect(el.firstElementChild?.getAttribute('data-testid')).toBe('icon');
  });

  it('exposes data-color, data-intensity, data-slot="pill" for downstream introspection', () => {
    render(
      <PillBase color="waiting" intensity="loud" shape="h-5 px-2">
        x
      </PillBase>,
    );
    const el = screen.getByText('x');
    expect(el.dataset.slot).toBe('pill');
    expect(el.dataset.color).toBe('waiting');
    expect(el.dataset.intensity).toBe('loud');
  });

  it('applies tool-color classes when toolColor is set', () => {
    render(
      <PillBase toolColor="bash" intensity="mid" shape="h-5 px-2">
        bash
      </PillBase>,
    );
    const el = screen.getByText('bash');
    expect(el.className).toContain('text-amber-300');
    expect(el.className).toContain('border-amber-500');
  });

  it('toolColor takes precedence over color when both are passed', () => {
    render(
      <PillBase color="running" toolColor="bash" intensity="mid" shape="h-5 px-2">
        bash
      </PillBase>,
    );
    const el = screen.getByText('bash');
    expect(el.className).toContain('text-amber-300');
    expect(el.className).not.toContain('text-slate');
  });

  it('default toolColor falls back to slate-400 text', () => {
    render(
      <PillBase toolColor="default" intensity="mid" shape="h-5 px-2">
        unk
      </PillBase>,
    );
    const el = screen.getByText('unk');
    expect(el.className).toContain('text-slate-400');
  });

  it('static span pills get no hover/cursor/transition (not interactive)', () => {
    render(
      <PillBase color="running" intensity="mid" shape="h-5 px-2">
        static
      </PillBase>,
    );
    const el = screen.getByText('static');
    expect(el.className).not.toContain('hover:');
    expect(el.className).not.toContain('cursor-pointer');
    expect(el.className).not.toContain('transition');
  });

  it('button pills get hover surface + cursor-pointer + transition', () => {
    render(
      <PillBase as="button" color="running" intensity="mid" shape="h-8 px-3">
        go
      </PillBase>,
    );
    const el = screen.getByText('go');
    expect(el.className).toContain('hover:brightness-125');
    expect(el.className).toContain('cursor-pointer');
    expect(el.className).toContain('transition');
  });

  it('asChild pills are interactive and get the hover surface', () => {
    render(
      <PillBase asChild color="running" intensity="ghost" shape="h-6 px-2">
        <a href="/x">link</a>
      </PillBase>,
    );
    const link = screen.getByRole('link', { name: 'link' });
    expect(link.className).toContain('hover:bg-slate-1050');
    expect(link.className).toContain('cursor-pointer');
  });

  it('asChild composes icon slot + class string onto the wrapped child element', () => {
    render(
      <PillBase asChild shape="h-6 px-2" icon={<svg data-testid="icon" />}>
        <a href="/x">View PR</a>
      </PillBase>,
    );
    const link = screen.getByRole('link', { name: /View PR/ });
    expect(link.getAttribute('href')).toBe('/x');
    // The merged className lands on the anchor itself, not on a wrapper.
    expect(link.className).toContain('h-6');
    expect(link.className).toContain('inline-flex');
    // The icon is rendered as a sibling of the anchor's text, inside the anchor.
    expect(link.querySelector('[data-testid="icon"]')).not.toBeNull();
  });
});
