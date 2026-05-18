import { figma } from '@figma/code-connect';

import { BrandMark } from '@/components/BrandMark';

figma.connect(
  BrandMark,
  'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=220-211',
  {
    example: () => <BrandMark />,
  },
);
