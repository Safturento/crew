export type ToolColorKey =
  | 'bash'
  | 'edit'
  | 'read'
  | 'write'
  | 'grep'
  | 'todoWrite'
  | 'task'
  | 'mcpJira'
  | 'mcpFigma'
  | 'mcpChrome'
  | 'mcpPlaywright'
  | 'mcpMemory'
  | 'mcpAtlassian'
  | 'webNet'
  | 'default';

export interface ToolColorTokens {
  text: string;
  bg: string;
  border: string;
  solidBg: string;
  solidBorder: string;
}

export const TOOL_COLOR_CLASSES: Record<ToolColorKey, ToolColorTokens> = {
  bash: {
    text: 'text-amber-300',
    bg: 'bg-amber-950/40',
    border: 'border-amber-500/60',
    solidBg: 'bg-amber-500',
    solidBorder: 'border-amber-500',
  },
  edit: {
    text: 'text-green-300',
    bg: 'bg-green-950/40',
    border: 'border-green-500/60',
    solidBg: 'bg-green-500',
    solidBorder: 'border-green-500',
  },
  read: {
    text: 'text-slate-300',
    bg: 'bg-slate-800/40',
    border: 'border-slate-500/60',
    solidBg: 'bg-slate-500',
    solidBorder: 'border-slate-500',
  },
  write: {
    text: 'text-emerald-300',
    bg: 'bg-emerald-950/40',
    border: 'border-emerald-500/60',
    solidBg: 'bg-emerald-500',
    solidBorder: 'border-emerald-500',
  },
  grep: {
    text: 'text-violet-300',
    bg: 'bg-violet-950/40',
    border: 'border-violet-500/60',
    solidBg: 'bg-violet-500',
    solidBorder: 'border-violet-500',
  },
  todoWrite: {
    text: 'text-sky-300',
    bg: 'bg-sky-950/40',
    border: 'border-sky-500/60',
    solidBg: 'bg-sky-500',
    solidBorder: 'border-sky-500',
  },
  task: {
    text: 'text-indigo-300',
    bg: 'bg-indigo-950/40',
    border: 'border-indigo-500/60',
    solidBg: 'bg-indigo-500',
    solidBorder: 'border-indigo-500',
  },
  mcpJira: {
    text: 'text-blue-300',
    bg: 'bg-blue-950/40',
    border: 'border-blue-500/60',
    solidBg: 'bg-blue-500',
    solidBorder: 'border-blue-500',
  },
  mcpFigma: {
    text: 'text-pink-300',
    bg: 'bg-pink-950/40',
    border: 'border-pink-500/60',
    solidBg: 'bg-pink-500',
    solidBorder: 'border-pink-500',
  },
  mcpChrome: {
    text: 'text-cyan-300',
    bg: 'bg-cyan-950/40',
    border: 'border-cyan-500/60',
    solidBg: 'bg-cyan-500',
    solidBorder: 'border-cyan-500',
  },
  mcpPlaywright: {
    text: 'text-teal-300',
    bg: 'bg-teal-950/40',
    border: 'border-teal-500/60',
    solidBg: 'bg-teal-500',
    solidBorder: 'border-teal-500',
  },
  mcpMemory: {
    text: 'text-fuchsia-300',
    bg: 'bg-fuchsia-950/40',
    border: 'border-fuchsia-500/60',
    solidBg: 'bg-fuchsia-500',
    solidBorder: 'border-fuchsia-500',
  },
  mcpAtlassian: {
    text: 'text-blue-300',
    bg: 'bg-blue-950/40',
    border: 'border-blue-500/60',
    solidBg: 'bg-blue-500',
    solidBorder: 'border-blue-500',
  },
  webNet: {
    text: 'text-lime-300',
    bg: 'bg-lime-950/40',
    border: 'border-lime-500/60',
    solidBg: 'bg-lime-500',
    solidBorder: 'border-lime-500',
  },
  default: {
    text: 'text-slate-400',
    bg: 'bg-slate-800/40',
    border: 'border-slate-600/60',
    solidBg: 'bg-slate-600',
    solidBorder: 'border-slate-600',
  },
};
