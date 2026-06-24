import { figma } from '@figma/code-connect';

import { defaultTimelineFilterState, FilterRow, Filters } from '@/components/Timeline/Filters';

// FilterRow — Figma COMPONENT_SET (variant axis `state`; component properties
// Has Count/Count, Has Disclosure, Chevron Icon, Indent). The `state` variant
// drives both the nested Checkbox visual and the row-level dim (disabled).
// `count` is a TEXT in Figma ("5 / 11") but a {visible,total} object in code,
// so the example threads a representative pair. The chevron glyph is an
// INSTANCE_SWAP in Figma (chevron-right/down) rather than a code-style boolean,
// so `expanded`/`onToggleExpanded` are owned by the menu, not mapped here.
figma.connect(
  FilterRow,
  'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=842-4125',
  {
    props: {
      checked: figma.enum('state', { on: true, off: false, disabled: false }),
      disabled: figma.enum('state', { disabled: true, on: false, off: false }),
      indent: figma.boolean('Indent'),
      count: figma.boolean('Has Count', {
        true: { visible: 5, total: 11 },
        false: undefined,
      }),
      checkbox: figma.nestedProps('Checkbox', { label: figma.string('Label') }),
    },
    example: ({ checked, disabled, indent, count, checkbox }) => (
      <FilterRow
        id="filter-cat-tools"
        label={checkbox.label}
        checked={checked}
        disabled={disabled}
        indent={indent}
        count={count}
        onToggle={() => {}}
      />
    ),
  },
);

// FilterMenu — Figma COMPONENT_SET (variant axis `tools`: collapsed/expanded)
// mirrors `Filters`' `PopoverContent`. The `tools` variant reflects the
// component's internal `toolsExpanded` state (owned, not a prop), so it isn't
// mapped. The popover trigger stays a Pill in TimelineToolbar. The expanded
// tool subtree is a static representative sample in Figma; in code it derives
// from `tokensByTool`, threaded empty here so the snippet renders standalone.
figma.connect(
  Filters,
  'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=844-4328',
  {
    example: () => (
      <Filters state={defaultTimelineFilterState} onChange={() => {}} tokensByTool={[]} />
    ),
  },
);
