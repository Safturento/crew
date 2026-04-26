import { execa } from 'execa';

export interface PrSummary {
  number: number;
  state: string;
  url: string;
}

export interface ReviewComment {
  author: string;
  path: string;
  line: number | null;
  body: string;
}

export interface IssueComment {
  author: string;
  createdAt: string;
  body: string;
}

export interface Review {
  author: string;
  state: string;
  body: string;
}

export type PrState = 'open' | 'closed' | 'merged' | 'all';

export async function getPrForBranch(
  branch: string,
  state: PrState = 'all',
): Promise<PrSummary | null> {
  const { stdout } = await execa('gh', [
    'pr',
    'list',
    '--head',
    branch,
    '--state',
    state,
    '--json',
    'number,state,url',
  ]);
  const list = JSON.parse(stdout) as PrSummary[];
  return list[0] ?? null;
}

export async function mergeStatus(prNumber: number): Promise<{ state: string }> {
  const { stdout } = await execa('gh', [
    'pr',
    'view',
    String(prNumber),
    '--json',
    'state,mergedAt',
  ]);
  return JSON.parse(stdout) as { state: string };
}

export async function getIssueComments(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<IssueComment[]> {
  const { stdout } = await execa('gh', [
    'api',
    `repos/${owner}/${repo}/issues/${prNumber}/comments`,
  ]);
  type Raw = { user: { login: string }; created_at: string; body: string };
  const list = JSON.parse(stdout) as Raw[];
  return list.map((c) => ({
    author: c.user.login,
    createdAt: c.created_at,
    body: c.body,
  }));
}

export async function getReviews(owner: string, repo: string, prNumber: number): Promise<Review[]> {
  const { stdout } = await execa('gh', ['api', `repos/${owner}/${repo}/pulls/${prNumber}/reviews`]);
  type Raw = { user: { login: string }; state: string; body: string | null };
  const list = JSON.parse(stdout) as Raw[];
  return list
    .filter((r): r is Raw & { body: string } => typeof r.body === 'string' && r.body.length > 0)
    .map((r) => ({
      author: r.user.login,
      state: r.state,
      body: r.body,
    }));
}

export async function getReviewComments(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<ReviewComment[]> {
  const query = `
    query($owner:String!, $repo:String!, $num:Int!) {
      repository(owner:$owner, name:$repo) {
        pullRequest(number:$num) {
          reviewThreads(first:100) {
            nodes {
              isResolved
              comments(first:50) {
                nodes {
                  author { login }
                  path
                  line
                  originalLine
                  body
                }
              }
            }
          }
        }
      }
    }
  `;
  const { stdout } = await execa('gh', [
    'api',
    'graphql',
    '-f',
    `query=${query}`,
    '-F',
    `owner=${owner}`,
    '-F',
    `repo=${repo}`,
    '-F',
    `num=${prNumber}`,
  ]);

  type GraphQLResponse = {
    data: {
      repository: {
        pullRequest: {
          reviewThreads: {
            nodes: Array<{
              isResolved: boolean;
              comments: {
                nodes: Array<{
                  author: { login: string };
                  path: string;
                  line: number | null;
                  originalLine: number | null;
                  body: string;
                }>;
              };
            }>;
          };
        };
      };
    };
  };

  const data = JSON.parse(stdout) as GraphQLResponse;
  const out: ReviewComment[] = [];
  for (const thread of data.data.repository.pullRequest.reviewThreads.nodes) {
    if (thread.isResolved) continue;
    for (const c of thread.comments.nodes) {
      out.push({
        author: c.author.login,
        path: c.path,
        line: c.line ?? c.originalLine,
        body: c.body,
      });
    }
  }
  return out;
}
