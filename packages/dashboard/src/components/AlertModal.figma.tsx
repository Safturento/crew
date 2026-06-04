import { figma } from '@figma/code-connect';

import { AlertModal } from '@/components/AlertModal';

figma.connect(
  AlertModal,
  'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=373-413',
  {
    props: {
      title: figma.string('Title'),
      description: figma.string('Description'),
    },
    example: ({ title, description }) => (
      <AlertModal title={title} description={description} open onOpenChange={() => {}} />
    ),
  },
);
