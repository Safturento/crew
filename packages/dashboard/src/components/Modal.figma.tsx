import { figma } from '@figma/code-connect';

import { Modal } from '@/components/Modal';

figma.connect(Modal, 'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=355-238', {
  props: {
    title: figma.string('Title'),
    showClose: figma.boolean('Show Close'),
    // Content is an INSTANCE_SWAP slot in Figma; in code it maps to arbitrary children.
    content: figma.instance('Content'),
  },
  example: ({ title, showClose, content }) => (
    <Modal title={title} showClose={showClose} open onOpenChange={() => {}}>
      {content}
    </Modal>
  ),
});
