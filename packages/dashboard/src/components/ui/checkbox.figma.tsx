import { figma } from '@figma/code-connect';

import { Checkbox } from '@/components/ui/checkbox';

figma.connect(
  Checkbox,
  'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=663-869',
  {
    props: {
      state: figma.enum('state', { on: 'checked', off: 'unchecked', disabled: 'disabled' }),
      Label: figma.string('Label'),
    },
    example: ({ state, Label }) =>
      state === 'disabled' ? (
        <label className="opacity-35">
          <Checkbox disabled /> {Label}
        </label>
      ) : (
        <label>
          <Checkbox checked={state === 'checked'} /> {Label}
        </label>
      ),
  },
);
