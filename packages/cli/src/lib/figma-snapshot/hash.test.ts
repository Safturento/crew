import { describe, it, expect } from 'vitest';
import { hashNode } from './hash.js';
import type { FigmaNode } from './client.js';

describe('hashNode', () => {
  it('is stable regardless of object key insertion order', () => {
    const a: FigmaNode = { id: '1:1', name: 'A', type: 'FRAME', fills: [], visible: true };
    // Same content, keys declared in a different order.
    const b: FigmaNode = { visible: true, type: 'FRAME', name: 'A', fills: [], id: '1:1' };
    expect(hashNode(a)).toBe(hashNode(b));
  });

  it('changes when a deeply nested property changes', () => {
    const base: FigmaNode = {
      id: '1:1',
      name: 'A',
      type: 'FRAME',
      children: [{ id: '2:2', name: 'label', type: 'TEXT', characters: 'Hello' }],
    };
    const changed: FigmaNode = {
      id: '1:1',
      name: 'A',
      type: 'FRAME',
      children: [{ id: '2:2', name: 'label', type: 'TEXT', characters: 'Goodbye' }],
    };
    expect(hashNode(base)).not.toBe(hashNode(changed));
  });

  it('preserves array order (reordered children hash differently)', () => {
    const a: FigmaNode = {
      id: '1:1',
      name: 'A',
      type: 'FRAME',
      children: [
        { id: '2:2', name: 'first', type: 'TEXT' },
        { id: '3:3', name: 'second', type: 'TEXT' },
      ],
    };
    const reordered: FigmaNode = {
      id: '1:1',
      name: 'A',
      type: 'FRAME',
      children: [
        { id: '3:3', name: 'second', type: 'TEXT' },
        { id: '2:2', name: 'first', type: 'TEXT' },
      ],
    };
    expect(hashNode(a)).not.toBe(hashNode(reordered));
  });

  it('returns a hex sha256 digest', () => {
    const h = hashNode({ id: '1:1', name: 'A', type: 'FRAME' });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});
