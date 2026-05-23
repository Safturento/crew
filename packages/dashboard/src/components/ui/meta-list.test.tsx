import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MetaList } from './meta-list.js';

describe('MetaList', () => {
  it('renders each child inside its own li', () => {
    const { container } = render(
      <MetaList>
        <span>runtime</span>
        <span>tokens</span>
        <span>events</span>
      </MetaList>,
    );
    const items = container.querySelectorAll('li');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('runtime');
    expect(items[1]).toHaveTextContent('tokens');
    expect(items[2]).toHaveTextContent('events');
  });

  it('renders a ul wrapper', () => {
    const { container } = render(
      <MetaList>
        <span>a</span>
      </MetaList>,
    );
    expect(container.querySelector('ul')).not.toBeNull();
  });

  it('drops falsy children so conditional items do not produce empty li', () => {
    const { container } = render(
      <MetaList>
        <span>a</span>
        {false}
        {null}
        <span>b</span>
      </MetaList>,
    );
    expect(container.querySelectorAll('li')).toHaveLength(2);
  });

  it('applies the dot-separator class on adjacent-sibling li (CSS sanity)', () => {
    const { container } = render(
      <MetaList>
        <span>a</span>
        <span>b</span>
      </MetaList>,
    );
    const ul = container.querySelector('ul')!;
    expect(ul.className).toMatch(/li\+li.*content/);
  });

  it('merges a caller className onto the ul', () => {
    const { container } = render(
      <MetaList className="gap-1.5 text-sm">
        <span>a</span>
      </MetaList>,
    );
    const ul = container.querySelector('ul')!;
    expect(ul.className).toContain('gap-1.5');
    expect(ul.className).toContain('text-sm');
  });
});
