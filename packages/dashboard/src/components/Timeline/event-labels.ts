export const ATTACHMENT_LABELS: Record<string, string> = {
  local_command: 'Local command',
  hook_success: 'Hook',
  hook_additional_context: 'Hook context',
  hook_system_message: 'Hook message',
  hook_non_blocking_error: 'Hook error',
  async_hook_response: 'Hook response',
  hook_cancelled: 'Hook cancelled',
  skill_listing: 'Skills',
  invoked_skills: 'Skill invoked',
  command_permissions: 'Permissions',
  deferred_tools_delta: 'Deferred tools',
  mcp_instructions_delta: 'MCP instructions',
  task_reminder: 'Task reminder',
  todo_reminder: 'Todo reminder',
  nested_memory: 'Memory',
  plan_mode: 'Plan mode',
  plan_mode_exit: 'Plan mode exit',
  plan_mode_reentry: 'Plan mode reentry',
  ultrathink_effort: 'Ultrathink',
  date_change: 'Date change',
  edited_text_file: 'File edit',
  opened_file_in_ide: 'File opened',
  compact_file_reference: 'File ref',
  queued_command: 'Queued command',
  file: 'File',
};

export const SYSTEM_LABELS: Record<string, string> = {
  stop_hook_summary: 'Stop hook',
  turn_duration: 'Turn',
  api_error: 'API error',
};

export function labelForAttachment(type: string): string {
  return ATTACHMENT_LABELS[type] ?? humanize(type);
}

export function labelForSystem(subtype: string): string {
  return SYSTEM_LABELS[subtype] ?? humanize(subtype);
}

export function humanize(key: string): string {
  if (!key) return '';
  const words = key.split(/[_-]+/).filter(Boolean);
  if (words.length === 0) return '';
  return words.map((w, i) => (i === 0 ? capitalize(w) : w.toLowerCase())).join(' ');
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
