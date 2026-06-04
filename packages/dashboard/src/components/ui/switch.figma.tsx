import { figma } from '@figma/code-connect';

import { Switch } from '@/components/ui/switch';

figma.connect(Switch, 'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=335-242', {
  props: {
    checked: figma.enum('state', { on: true, off: false }),
    label: figma.string('Label'),
  },
  example: ({ checked, label }) => (
    <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Switch checked={checked} onCheckedChange={() => {}} />
      {label}
    </label>
  ),
});
