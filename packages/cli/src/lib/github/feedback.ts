import { getIssueComments, getReviewComments, getReviews } from './client.js';

export const NO_FEEDBACK_MARKER = '(no review feedback found';

export interface AssemblePrFeedbackOptions {
  owner: string;
  repo: string;
  prNumber: number;
  prUrl: string;
}

/**
 * Assemble PR review feedback into a markdown block — same shape as the
 * fix-pr.sh bash script's auto-pull mode. Three sources, in order:
 *  - top-level PR issue comments
 *  - review submissions with non-empty bodies
 *  - line-level comments on UNRESOLVED review threads
 *
 * Returns a marker string when nothing matched so callers can short-circuit.
 */
export async function assemblePrFeedback(opts: AssemblePrFeedbackOptions): Promise<string> {
  const [topComments, reviews, threadComments] = await Promise.all([
    getIssueComments(opts.owner, opts.repo, opts.prNumber),
    getReviews(opts.owner, opts.repo, opts.prNumber),
    getReviewComments(opts.owner, opts.repo, opts.prNumber),
  ]);

  const sections: string[] = [];

  if (topComments.length > 0) {
    sections.push('### Top-level PR comments\n');
    for (const c of topComments) {
      sections.push(`- @${c.author} (${c.createdAt}): ${c.body}`);
    }
    sections.push('');
  }

  if (reviews.length > 0) {
    sections.push('### Review summaries\n');
    for (const r of reviews) {
      sections.push(`- @${r.author} [${r.state}]: ${r.body}`);
    }
    sections.push('');
  }

  if (threadComments.length > 0) {
    sections.push('### Inline review comments (unresolved threads only)\n');
    for (const c of threadComments) {
      const loc = c.line === null ? '?' : String(c.line);
      sections.push(`- \`${c.path}:${loc}\` (@${c.author}): ${c.body}`);
    }
    sections.push('');
  }

  if (sections.length === 0) {
    return `${NO_FEEDBACK_MARKER} — all threads resolved or no reviews submitted)`;
  }

  return [
    `## PR review feedback (PR #${opts.prNumber})`,
    `Source: ${opts.prUrl}`,
    '',
    ...sections,
  ].join('\n');
}
