import { GitPullRequest } from 'lucide-react';
import type { RepoInfo } from '../../../shared/api.ts';

interface PullRequestProps {
  repo: RepoInfo;
  value: string;
  onChange: (ref: string) => void;
}

/** `lens pr`: a number on the repository's GitHub remote, or a PR's URL. */
export function PullRequest({ repo, value, onChange }: PullRequestProps) {
  const { github } = repo;
  return (
    <div className='pr-panel'>
      <label className='pr-field'>
        <GitPullRequest size={16} />
        <input
          id='picker-pr'
          aria-label='PR number or URL'
          placeholder='A number, or a GitHub PR URL'
          autoFocus
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      <p className='hint'>
        {github ? (
          <>
            On <b>{github.remote}</b> → github.com/{github.owner}/{github.repo}. Fetched with plain git, so it uses your
            normal git auth: no token, no GitHub API.
          </>
        ) : (
          <>No remote here points at GitHub, so lens has nowhere to fetch a pull request from.</>
        )}
      </p>
    </div>
  );
}
