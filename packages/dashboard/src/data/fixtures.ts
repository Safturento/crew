import type { Agent, Project } from './types.js';

export const FIXTURE_PROJECTS: Project[] = [
  { name: 'kanban-api', repoPath: '~/code/kanban-api', branch: 'main', jiraKey: 'KAN', activeCount: 3 },
  { name: 'recipes-app', repoPath: '~/code/recipes-app', branch: 'main', jiraKey: 'REC', activeCount: 3 },
  { name: 'crew', repoPath: '~/code/crew', branch: 'main', jiraKey: 'CREW', activeCount: 1 },
];

export const FIXTURE_AGENTS: Agent[] = [
  {
    key: 'KAN-31',
    projectName: 'kanban-api',
    ticketTitle: 'Add board archival endpoint with audit log retention',
    state: 'waiting',
    startedAt: '2026-04-26T13:14:00Z',
    tokens: 48_240,
  },
  {
    key: 'KAN-29',
    projectName: 'kanban-api',
    ticketTitle: 'Refactor card-move handler to use the new event bus',
    state: 'running',
    startedAt: '2026-04-26T13:30:00Z',
    tokens: 12_010,
  },
  {
    key: 'KAN-22',
    projectName: 'kanban-api',
    ticketTitle: 'Migrate legacy column ordering field to JSONB',
    state: 'pr_open',
    startedAt: '2026-04-26T11:02:00Z',
    tokens: 87_500,
    prUrl: 'https://github.com/example/kanban-api/pull/142',
  },
  {
    key: 'REC-7',
    projectName: 'recipes-app',
    ticketTitle: 'Recipe search ranks ingredient matches above title-only',
    state: 'error',
    startedAt: '2026-04-26T12:50:00Z',
    tokens: 4_200,
  },
  {
    key: 'REC-11',
    projectName: 'recipes-app',
    ticketTitle: 'Bulk import csv supports new metric units',
    state: 'initializing',
    startedAt: '2026-04-26T13:42:00Z',
    tokens: 0,
  },
  {
    key: 'REC-3',
    projectName: 'recipes-app',
    ticketTitle: 'Server-render the recipe collection page for OG previews',
    state: 'idle',
    startedAt: '2026-04-26T09:11:00Z',
    tokens: 31_500,
  },
  {
    key: 'CREW-12',
    projectName: 'crew',
    ticketTitle: 'crew finish surfaces post-merge cleanup errors as exit codes',
    state: 'finished',
    startedAt: '2026-04-26T08:00:00Z',
    tokens: 22_700,
  },
];
