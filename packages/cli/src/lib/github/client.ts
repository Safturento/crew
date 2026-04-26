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

export async function getPrForBranch(branch: string): Promise<PrSummary | null> {
  const { stdout } = await execa('gh', [
    'pr',
    'list',
    '--head',
    branch,
    '--state',
    'all',
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
