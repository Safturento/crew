import { figma } from '@figma/code-connect';

import { BrandMark } from '@/components/BrandMark';

figma.connect(
  BrandMark,
  'https://www.figma.com/design/DsA7QuEa2WthDATkksd1Bq/Crew-Design-System?node-id=19-3',
  {
    example: () => <BrandMark />,
  },
);
