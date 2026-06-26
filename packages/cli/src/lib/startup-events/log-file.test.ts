import { describe, it, expect } from 'vitest';
import { startupLogFilePath } from './log-file.js';

describe('startupLogFilePath', () => {
  it('resolves <home>/.crew/startup/<key>.log', () => {
    expect(startupLogFilePath('CREW-1', '/home/u')).toBe('/home/u/.crew/startup/CREW-1.log');
  });

  it('is a sibling of the .jsonl startup events under the same root', () => {
    expect(startupLogFilePath('CREW-42', '/tmp/h')).toBe('/tmp/h/.crew/startup/CREW-42.log');
  });
});
