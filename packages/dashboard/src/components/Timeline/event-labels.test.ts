import { describe, expect, it } from 'vitest';

import {
  ATTACHMENT_LABELS,
  SYSTEM_LABELS,
  humanize,
  labelForAttachment,
  labelForSystem,
} from './event-labels.js';

describe('humanize', () => {
  it('snake_case → Sentence case', () => {
    expect(humanize('hook_success')).toBe('Hook success');
    expect(humanize('plan_mode_reentry')).toBe('Plan mode reentry');
  });
  it('kebab-case → Sentence case', () => {
    expect(humanize('api-error')).toBe('Api error');
  });
  it('single word', () => {
    expect(humanize('file')).toBe('File');
  });
  it('empty string → empty string', () => {
    expect(humanize('')).toBe('');
  });
  it('collapses repeated separators', () => {
    expect(humanize('weird__thing__here')).toBe('Weird thing here');
  });
});

describe('labelForAttachment', () => {
  it('returns mapped label for known type', () => {
    expect(labelForAttachment('local_command')).toBe('Local command');
    expect(labelForAttachment('hook_success')).toBe('Hook');
    expect(labelForAttachment('skill_listing')).toBe('Skills');
    expect(labelForAttachment('compact_file_reference')).toBe('File ref');
  });
  it('falls back to humanize for unknown type', () => {
    expect(labelForAttachment('weird_thing')).toBe('Weird thing');
    expect(labelForAttachment('future_event_type')).toBe('Future event type');
  });
  it('every known classification subtype has a mapping', () => {
    const KNOWN_HOOKS = [
      'hook_success',
      'hook_additional_context',
      'hook_system_message',
      'hook_non_blocking_error',
      'async_hook_response',
      'skill_listing',
      'invoked_skills',
      'command_permissions',
      'plan_mode',
      'date_change',
    ];
    for (const k of KNOWN_HOOKS) {
      expect(ATTACHMENT_LABELS[k]).toBeDefined();
    }
  });
});

describe('labelForSystem', () => {
  it('returns mapped label for known subtype', () => {
    expect(labelForSystem('turn_duration')).toBe('Turn');
    expect(labelForSystem('api_error')).toBe('API error');
    expect(labelForSystem('stop_hook_summary')).toBe('Stop hook');
  });
  it('falls back to humanize for unknown subtype', () => {
    expect(labelForSystem('something_new')).toBe('Something new');
  });
  it('SYSTEM_LABELS is non-empty', () => {
    expect(Object.keys(SYSTEM_LABELS).length).toBeGreaterThan(0);
  });
  it('CREW-201 startup phase subtypes have human-readable labels', () => {
    expect(labelForSystem('crew_startup_preflight')).toBe('Preflight');
    expect(labelForSystem('crew_startup_worktree')).toBe('Worktree');
    expect(labelForSystem('crew_startup_env_spec')).toBe('Env spec');
    expect(labelForSystem('crew_startup_npm_install')).toBe('npm install');
    expect(labelForSystem('crew_startup_docker')).toBe('Docker');
    expect(labelForSystem('crew_startup_mcp')).toBe('MCP');
    expect(labelForSystem('crew_startup_claude_spawn')).toBe('Claude spawn');
  });
  it('CREW-313 pre-spawn tail phases + failed-start have labels', () => {
    expect(labelForSystem('crew_startup_bruno_env')).toBe('Bruno env');
    expect(labelForSystem('crew_startup_playwright_install')).toBe('Playwright install');
    expect(labelForSystem('crew_startup_dispatch_preflight')).toBe('Dispatch preflight');
    expect(labelForSystem('crew_startup_skill_injection')).toBe('Skill injection');
    expect(labelForSystem('crew_failed_start')).toBe('Failed start');
  });
});
