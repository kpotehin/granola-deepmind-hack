import type {
  ActionProvider,
  CreateItemParams,
  CreatedItem,
} from "./types.js";

/**
 * GitHub provider — creates issues and PRs via GitHub API.
 *
 * Requires GITHUB_TOKEN and GITHUB_REPO in env.
 * Uses dynamic import of @octokit/rest to avoid hard dependency.
 */
export class GitHubProvider implements ActionProvider {
  name = "github";
  type = "code-platform" as const;

  private octokit: any = null;
  private owner = "";
  private repo = "";

  async init(): Promise<void> {
    const token = process.env.GITHUB_TOKEN;
    const repoFull = process.env.GITHUB_REPO; // "owner/repo"

    if (!token || !repoFull) {
      throw new Error("GITHUB_TOKEN and GITHUB_REPO required");
    }

    const [owner, repo] = repoFull.split("/");
    this.owner = owner;
    this.repo = repo;

    // Dynamic import — @octokit/rest only needed if GitHub is configured
    // @ts-ignore — optional dependency, only loaded when GITHUB_TOKEN is set
    const { Octokit } = await import("@octokit/rest");
    this.octokit = new Octokit({ auth: token });
  }

  async createItem(params: CreateItemParams): Promise<CreatedItem> {
    if (!this.octokit) throw new Error("GitHub not initialized");

    if (params.type === "pr") {
      return this.createPR(params);
    }

    return this.createIssue(params);
  }

  private async createIssue(params: CreateItemParams): Promise<CreatedItem> {
    const { data } = await this.octokit.issues.create({
      owner: this.owner,
      repo: this.repo,
      title: params.title,
      body: params.description,
      ...(params.assignee ? { assignees: [params.assignee] } : {}),
    });

    return {
      id: `#${data.number}`,
      url: data.html_url,
      title: params.title,
      provider: this.name,
    };
  }

  private async createPR(params: CreateItemParams): Promise<CreatedItem> {
    const head = (params.metadata?.branch as string) || "main";
    const base = (params.metadata?.base as string) || "main";

    const { data } = await this.octokit.pulls.create({
      owner: this.owner,
      repo: this.repo,
      title: params.title,
      body: params.description,
      head,
      base,
    });

    return {
      id: `#${data.number}`,
      url: data.html_url,
      title: params.title,
      provider: this.name,
    };
  }
}
