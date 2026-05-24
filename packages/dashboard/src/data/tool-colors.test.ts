import { describe, expect, it } from 'vitest';

import { TOOL_COLOR_CLASSES, type ToolColorKey } from './tool-colors.js';

const EXPECTED_KEYS: ToolColorKey[] = [
  'bash',
  'edit',
  'read',
  'write',
  'grep',
  'todoWrite',
  'task',
  'mcpJira',
  'mcpFigma',
  'mcpChrome',
  'mcpPlaywright',
  'mcpMemory',
  'mcpAtlassian',
  'webNet',
  'default',
];

describe('TOOL_COLOR_CLASSES', () => {
  it('has all 15 expected keys', () => {
    expect(Object.keys(TOOL_COLOR_CLASSES).sort()).toEqual([...EXPECTED_KEYS].sort());
  });

  it('every entry has text/bg/border/solidBg/solidBorder fields', () => {
    for (const key of EXPECTED_KEYS) {
      const entry = TOOL_COLOR_CLASSES[key];
      expect(entry.text).toBeTruthy();
      expect(entry.bg).toBeTruthy();
      expect(entry.border).toBeTruthy();
      expect(entry.solidBg).toBeTruthy();
      expect(entry.solidBorder).toBeTruthy();
    }
  });

  it('uses static Tailwind class strings (JIT-discoverable)', () => {
    const all = Object.values(TOOL_COLOR_CLASSES).flatMap((e) => [
      e.text,
      e.bg,
      e.border,
      e.solidBg,
      e.solidBorder,
    ]);
    for (const cls of all) {
      expect(cls).toMatch(/^(text-|bg-|border-)/);
    }
  });

  it('mcpJira and mcpAtlassian share blue (per palette decision)', () => {
    expect(TOOL_COLOR_CLASSES.mcpJira.text).toBe(TOOL_COLOR_CLASSES.mcpAtlassian.text);
    expect(TOOL_COLOR_CLASSES.mcpJira.border).toBe(TOOL_COLOR_CLASSES.mcpAtlassian.border);
  });
});
