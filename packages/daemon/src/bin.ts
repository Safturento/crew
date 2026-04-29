import { startDaemon } from './startDaemon.js';

startDaemon().catch((err) => {
  console.error(err);
  process.exit(1);
});
