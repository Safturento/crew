import { figma } from '@figma/code-connect';

import { Badge } from '@/components/ui/badge';
import { ModalSelectionRow } from '@/components/ModalSelectionRow';

figma.connect(
  ModalSelectionRow,
  'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=350-236',
  {
    props: {
      primary: figma.string('Primary'),
      secondary: figma.string('Secondary'),
      meta: figma.string('Meta'),
      showBadge: figma.boolean('Show Badge'),
    },
    example: ({ primary, secondary, meta, showBadge }) => (
      <ModalSelectionRow
        primary={primary}
        secondary={secondary}
        meta={meta}
        badge={
          showBadge ? (
            <Badge color="running" intensity="muted">
              Badge
            </Badge>
          ) : undefined
        }
      />
    ),
  },
);
