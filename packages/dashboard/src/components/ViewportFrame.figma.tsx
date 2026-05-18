import { figma } from '@figma/code-connect';

import { ViewportFrame } from '@/components/ViewportFrame';

figma.connect(
  ViewportFrame,
  'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=220-292',
  {
    // Single-variant chrome wrapper. Children slot in at runtime; the Figma
    // component shows a placeholder in the content area.
    example: () => (
      <ViewportFrame>
        <div />
      </ViewportFrame>
    ),
  },
);
