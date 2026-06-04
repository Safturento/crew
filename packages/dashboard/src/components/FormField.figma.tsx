import { figma } from '@figma/code-connect';

import { FormField } from '@/components/FormField';

figma.connect(FormField, 'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=337-234', {
  props: {
    label: figma.string('Label'),
  },
  example: ({ label }) => <FormField label={label} placeholder="Placeholder" />,
});
