import { figma } from '@figma/code-connect';

import { ViewportFrame } from '@/components/ViewportFrame';

figma.connect(
  ViewportFrame,
  'https://www.figma.com/design/DsA7QuEa2WthDATkksd1Bq/Crew-Design-System?node-id=27-4',
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
