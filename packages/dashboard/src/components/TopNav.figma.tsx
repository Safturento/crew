import { figma } from '@figma/code-connect';

import { TopNav } from '@/components/TopNav';

figma.connect(TopNav, 'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=245-133', {
  // The Figma skeleton has no variant axis yet; the dashboard's TopNav derives its
  // active-tab state from a Route prop that has no clean Figma analogue. Snippet
  // documents the canonical mount with placeholder handlers.
  example: () => (
    <TopNav
      route={{ kind: 'agents-list' }}
      attentionCount={0}
      onClearAttention={() => {}}
      onNewRun={() => {}}
    />
  ),
});
