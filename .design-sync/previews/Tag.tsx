import * as React from 'react';
import { Tag } from 'crew-dashboard';

/** Agent-state tags at the default `mid` intensity — the timeline treatment. */
export const StateTags = () => (
  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
    <Tag color="initializing">initializing</Tag>
    <Tag color="queued">queued</Tag>
    <Tag color="running">running</Tag>
    <Tag color="idle">idle</Tag>
    <Tag color="waiting">waiting</Tag>
    <Tag color="pr_open">pr open</Tag>
    <Tag color="pr_merged">pr merged</Tag>
    <Tag color="error">error</Tag>
    <Tag color="orphaned">orphaned</Tag>
    <Tag color="finished">finished</Tag>
  </div>
);

/** The four intensity steps on one color. */
export const Intensities = () => (
  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
    <Tag color="running" intensity="ghost">ghost</Tag>
    <Tag color="running" intensity="muted">muted</Tag>
    <Tag color="running" intensity="mid">mid</Tag>
    <Tag color="running" intensity="loud">loud</Tag>
  </div>
);

/** Tool-colored tags as used on transcript rows (TranscriptRow). */
export const ToolTags = () => (
  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
    <Tag toolColor="bash" intensity="mid">Bash</Tag>
    <Tag toolColor="read" intensity="mid">Read</Tag>
    <Tag toolColor="edit" intensity="mid">Edit</Tag>
  </div>
);
