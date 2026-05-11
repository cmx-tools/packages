import { execFileOutput } from "./execFileOutput.js";

const milestoneRe =
  /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/milestone\/([0-9]+)/;

const githubComIssueRe =
  /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/([0-9]+)\/?(?:[?#].*)?$/;
const githubComPullRequestRe =
  /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/([0-9]+)\/?(?:[?#].*)?$/;

const ghIssueJsonFields = "number,title,url,state,labels,body" as const;

const parentCrossRefPageSize = 100;

const parentCrossRefQuery = `
query($owner: String!, $repo: String!, $number: Int!, $endCursor: String) {
  repository(owner: $owner, name: $repo) {
    issue(number: $number) {
      timelineItems(
        first: ${parentCrossRefPageSize}
        after: $endCursor
        itemTypes: [CROSS_REFERENCED_EVENT]
      ) {
        pageInfo { hasNextPage endCursor }
        nodes {
          __typename
          ... on CrossReferencedEvent {
            referencedAt
            source {
              __typename
              ... on Issue {
                number
                title
                url
                state
                body
                labels(first: 100) { nodes { name } }
              }
            }
          }
        }
      }
    }
  }
}`.replace(/\s+/g, " ");

type GhIssue = {
  number: number;
  title: string;
  url: string;
  state: string;
  labels: { name: string }[];
  body: string | null;
};

type GhIssueComment = {
  body?: string | null;
  author?: { login?: string | null } | null;
};

type GhIssueWithComments = GhIssue & {
  comments?: GhIssueComment[] | null;
};

type GhPullRequest = {
  number: number;
  title: string;
  url: string;
  body: string | null;
};

type LabelFilterOptions = {
  requiredLabels?: string[];
  excludedLabels?: string[];
};

type LabelFilterConfig = {
  requiredLabels: string[];
  excludedLabels: string[];
};

const defaultLabelFilters: LabelFilterConfig = {
  requiredLabels: ["afk"],
  excludedLabels: ["in_progress", "in_review"],
};

type GqlIssueForCollect = {
  number: number;
  title: string;
  url: string;
  state: string;
  body: string | null;
  labels: { nodes: { name: string }[] };
};

type CrossRefGqlData = {
  data?: {
    repository?: {
      issue?: {
        timelineItems?: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: Array<{
            __typename?: string;
            referencedAt?: string;
            source?: {
              __typename?: string;
            } & Partial<GqlIssueForCollect>;
          } | null>;
        } | null;
      } | null;
    } | null;
  };
  errors?: Array<{ message: string }>;
};

export type CollectedIssues = {
  text: string;
  issueUrls: string[];
  inputTasks: string;
};

export type PullRequestFixReferences = {
  prdUrl: string;
  summary: string;
};

export async function resolvePullRequestFixReferences(
  issueLinkOrFolder: string | undefined,
): Promise<PullRequestFixReferences | null> {
  if (!issueLinkOrFolder) return null;

  const pullRequestIdent = parseGitHubComPullRequest(issueLinkOrFolder);
  if (!pullRequestIdent) return null;

  const pullRequestFixRefs =
    await collectPullRequestFixReferences(issueLinkOrFolder);

  if (!pullRequestFixRefs.prdUrl) {
    throw new Error(
      `Expected pull request body to contain fix: reference to a PRD issue: ${issueLinkOrFolder}`,
    );
  }

  return pullRequestFixRefs;
}

export async function collectTaskIssues(
  taskUrl: string,
  labels: LabelFilterOptions = {},
): Promise<string> {
  const filters = normalizeLabelFilters(labels);
  return formatIssueBlocks(await collectTaskIssueList(taskUrl, filters));
}

export async function collectIssueSnapshot(
  taskUrls: string[],
  labels: LabelFilterOptions = {},
): Promise<CollectedIssues | null> {
  const filters = normalizeLabelFilters(labels);
  const issues: GhIssue[] = [];
  const inputTasks: string[] = [];
  for (const url of taskUrls) {
    try {
      issues.push(...(await collectTaskIssueList(url, filters)));
      inputTasks.push(await collectInputTaskContext(url));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`collect issues for ${url}: ${msg}`);
    }
  }

  if (issues.length === 0) return null;

  return {
    text: formatIssueBlocks(issues),
    issueUrls: [...new Set(issues.map((issue) => issue.url))],
    inputTasks: formatInputTasks(inputTasks),
  };
}

export async function collectIssues(
  taskUrls: string[],
  labels: LabelFilterOptions = {},
): Promise<string> {
  const snapshot = await collectIssueSnapshot(taskUrls, labels);
  return snapshot == null ? "" : snapshot.text;
}

export async function collectPullRequestFixReferences(
  pullRequestUrl: string,
): Promise<PullRequestFixReferences> {
  const pullRequestIdent = parseGitHubComPullRequest(pullRequestUrl);
  if (!pullRequestIdent) return { prdUrl: "", summary: "" };

  const pullRequest = await loadPullRequestFromGh(pullRequestUrl);
  const issueUrls = extractFixIssueUrls(
    pullRequest.body ?? "",
    pullRequestIdent.owner,
    pullRequestIdent.repo,
  );

  for (const issueUrl of issueUrls) {
    const issue = await loadIssueWithCommentsFromGh(issueUrl);
    if (!isPrdIssue(issue)) continue;
    return {
      prdUrl: issue.url,
      summary: extractIssueSummary(issue),
    };
  }

  return {
    prdUrl: "",
    summary: "",
  };
}

export async function collectBestNextTaskInput(
  issueSnapshot: CollectedIssues,
  bestNext: string | number,
) {
  const bestNextTaskNumber = String(bestNext).trim();
  const bestNextTaskUrl = issueSnapshot.issueUrls.find((url) =>
    url.endsWith(`/issues/${bestNextTaskNumber}`),
  );
  if (!bestNextTaskUrl) {
    throw new Error(
      `Planner selected task #${bestNextTaskNumber}, but URL was not found in candidate list.`,
    );
  }
  return {
    url: bestNextTaskUrl,
    task: (await collectInputTaskContext(bestNextTaskUrl)).trim(),
  };
}

async function collectTaskIssueList(
  taskUrl: string,
  filters: LabelFilterConfig,
): Promise<GhIssue[]> {
  const m = taskUrl.match(milestoneRe);
  if (m) {
    const [, owner, repo, milestone] = m;
    return ghIssueListMilestone(owner!, repo!, milestone!, filters);
  }
  return collectFromIssueInput(taskUrl, filters);
}

function labelNames(issue: GhIssue): string[] {
  return issue.labels.map((l) => l.name);
}

function isOpen(issue: GhIssue): boolean {
  return issue.state.toLowerCase() === "open";
}

function isEligible(issue: GhIssue, filters: LabelFilterConfig): boolean {
  const names = new Set(labelNames(issue));
  return (
    isOpen(issue) &&
    filters.requiredLabels.every((label) => names.has(label)) &&
    filters.excludedLabels.every((label) => !names.has(label))
  );
}

function hasRequiredLabels(
  issue: GhIssue,
  filters: LabelFilterConfig,
): boolean {
  const names = new Set(labelNames(issue));
  return filters.requiredLabels.every((label) => names.has(label));
}

function bodyDeclaresParent(
  body: string | null,
  parentNumber: number,
  parentUrl: string,
): boolean {
  if (body == null) return false;
  const normalizedBody = normalizeParentRefText(body);
  const normalizedParentUrl = normalizeParentRefText(parentUrl);
  const parentRef = `(?:#\\s*${parentNumber}(?!\\d)|${escapeRegExp(normalizedParentUrl)})`;
  const re = new RegExp(
    `(?:^|\\s)(?:#+\\s*)?parent\\s*:?\\s*(?:[-*+]\\s*)?${parentRef}(?=\\s|$)`,
    "i",
  );
  return re.test(normalizedBody);
}

function normalizeParentRefText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mapGraphqlIssueState(s: string): string {
  if (s === "OPEN" || s === "CLOSED") return s.toLowerCase();
  return s;
}

function gqlIssueToGhIssue(issue: GqlIssueForCollect): GhIssue {
  return {
    number: issue.number,
    title: issue.title,
    url: issue.url,
    state: mapGraphqlIssueState(issue.state),
    labels: (issue.labels?.nodes ?? []).map((n) => ({ name: n.name })),
    body: issue.body,
  };
}

function formatIssueBlock(issue: GhIssue): string {
  const names = labelNames(issue);
  const labelsText = names.length === 0 ? "none" : names.join(", ");
  const issueHeader = `ISSUE #${issue.number}`;
  return (
    `${issueHeader}\n` +
    `${"=".repeat(issueHeader.length)}\n\n` +
    `## ${issue.title}\n\n` +
    `URL: ${issue.url}\n` +
    `State: ${issue.state}\n` +
    `Labels: ${labelsText}\n\n` +
    `${issue.body ?? ""}\n`
  );
}

function formatIssueBlocks(issues: GhIssue[]): string {
  return issues.map(formatIssueBlock).join("\n");
}

function parseGitHubComIssue(
  issuesUrl: string,
): { owner: string; repo: string; number: number } | null {
  const m = issuesUrl.match(githubComIssueRe);
  if (!m) return null;
  return {
    owner: m[1]!,
    repo: m[2]!,
    number: Number(m[3]),
  };
}

function parseGitHubComPullRequest(
  pullRequestUrl: string,
): { owner: string; repo: string; number: number } | null {
  const m = pullRequestUrl.match(githubComPullRequestRe);
  if (!m) return null;
  return {
    owner: m[1]!,
    repo: m[2]!,
    number: Number(m[3]),
  };
}

async function fetchParentCrossRefPage(
  owner: string,
  repo: string,
  parentNumber: number,
  endCursor: string | null,
): Promise<CrossRefGqlData> {
  const { stdout, stderr, exitCode } = await execFileOutput("gh", [
    "api",
    "graphql",
    "-f",
    `query=${parentCrossRefQuery}`,
    "-F",
    `owner=${owner}`,
    "-F",
    `repo=${repo}`,
    "-F",
    `number=${parentNumber}`,
    "-F",
    endCursor == null ? "endCursor=null" : `endCursor=${endCursor}`,
  ]);
  if (exitCode !== 0) {
    throw new Error(stderr || `gh api graphql failed (${exitCode})`);
  }
  return JSON.parse(stdout) as CrossRefGqlData;
}

async function collectChildIssuesForParent(
  owner: string,
  repo: string,
  parentNumber: number,
  parentUrl: string,
  filters: LabelFilterConfig,
): Promise<GhIssue[]> {
  const seen = new Set<string>();
  const candidates: { issue: GhIssue; referencedAt: string }[] = [];
  let cursor: string | null = null;
  for (;;) {
    const res = await fetchParentCrossRefPage(
      owner,
      repo,
      parentNumber,
      cursor,
    );
    if (res.errors?.length) {
      throw new Error(res.errors.map((e) => e.message).join("; "));
    }
    const tli = res.data?.repository?.issue?.timelineItems;
    if (!tli) break;

    for (const node of tli.nodes ?? []) {
      if (node?.__typename !== "CrossReferencedEvent") continue;
      if (node.referencedAt == null) continue;
      const src = node.source;
      if (src?.__typename !== "Issue") continue;
      const gh = gqlIssueToGhIssue(src as GqlIssueForCollect);
      if (seen.has(gh.url)) continue;
      if (!bodyDeclaresParent(gh.body, parentNumber, parentUrl)) continue;
      if (!isEligible(gh, filters)) continue;
      seen.add(gh.url);
      candidates.push({ issue: gh, referencedAt: node.referencedAt });
    }

    if (!tli.pageInfo.hasNextPage) break;
    cursor = tli.pageInfo.endCursor;
    if (!cursor) break;
  }

  candidates.sort(
    (a, b) =>
      new Date(a.referencedAt).getTime() - new Date(b.referencedAt).getTime(),
  );
  return candidates.map((c) => c.issue);
}

async function ghIssueListMilestone(
  owner: string,
  repo: string,
  milestone: string,
  filters: LabelFilterConfig,
): Promise<GhIssue[]> {
  const issueListSearchQuery = buildIssueListSearchQuery(filters);
  const { stdout, stderr, exitCode } = await execFileOutput("gh", [
    "issue",
    "list",
    "--repo",
    `${owner}/${repo}`,
    "--milestone",
    milestone,
    "--state",
    "open",
    "--search",
    issueListSearchQuery,
    "--limit",
    "1000",
    "--json",
    ghIssueJsonFields,
  ]);
  if (exitCode !== 0) {
    throw new Error(stderr || `gh issue list failed (${exitCode})`);
  }
  return JSON.parse(stdout) as GhIssue[];
}

async function loadIssueFromGh(taskUrl: string): Promise<GhIssue> {
  const { stdout, stderr, exitCode } = await execFileOutput("gh", [
    "issue",
    "view",
    taskUrl,
    "--json",
    ghIssueJsonFields,
  ]);
  if (exitCode !== 0) {
    throw new Error(stderr || `gh issue view failed (${exitCode})`);
  }
  return JSON.parse(stdout) as GhIssue;
}

async function loadIssueWithCommentsFromGh(
  taskUrl: string,
): Promise<GhIssueWithComments> {
  const { stdout, stderr, exitCode } = await execFileOutput("gh", [
    "issue",
    "view",
    taskUrl,
    "--json",
    "number,title,url,state,labels,body,comments",
  ]);
  if (exitCode !== 0) {
    throw new Error(stderr || `gh issue view failed (${exitCode})`);
  }
  return JSON.parse(stdout) as GhIssueWithComments;
}

async function loadPullRequestFromGh(
  pullRequestUrl: string,
): Promise<GhPullRequest> {
  const { stdout, stderr, exitCode } = await execFileOutput("gh", [
    "pr",
    "view",
    pullRequestUrl,
    "--json",
    "number,title,url,body",
  ]);
  if (exitCode !== 0) {
    throw new Error(stderr || `gh pr view failed (${exitCode})`);
  }
  return JSON.parse(stdout) as GhPullRequest;
}

function formatInputTasks(blocks: string[]): string {
  return blocks.filter((b) => b.trim().length > 0).join("\n\n");
}

function formatInputTaskComments(
  comments: GhIssueComment[] | null | undefined,
): string {
  const usable = (comments ?? []).filter((comment) => {
    return (comment.body ?? "").trim().length > 0;
  });

  if (usable.length === 0) return "(no comments)";

  return usable
    .map((comment, idx) => {
      const author = comment.author?.login?.trim() || "unknown";
      return `#### Comment ${idx + 1} by @${author}\n\n${comment.body?.trim()}`;
    })
    .join("\n\n");
}

async function collectInputTaskContext(taskUrl: string): Promise<string> {
  const issueIdent = parseGitHubComIssue(taskUrl);
  if (!issueIdent) {
    return `URL: ${taskUrl}\n\nBody/comments unavailable for non-issue URL input.`;
  }

  const issue = await loadIssueWithCommentsFromGh(taskUrl);
  return formatInputTaskContext(issue);
}

function formatInputTaskContext(issue: GhIssueWithComments): string {
  return (
    `## ${issue.title}\n\n` +
    `URL: ${issue.url}\n\n` +
    `### Body\n\n` +
    `${issue.body ?? "(empty body)"}\n\n` +
    `### Comments\n\n` +
    `${formatInputTaskComments(issue.comments)}\n`
  );
}

function isPrdIssue(issue: GhIssue): boolean {
  const title = issue.title.toLowerCase();
  if (/\bprd\b/.test(title)) return true;

  const labels = new Set(issue.labels.map((label) => label.name.toLowerCase()));
  if (labels.has("prd") || labels.has("product-requirements")) return true;

  const body = issue.body?.toLowerCase() ?? "";
  if (/\bproduct requirements document\b/.test(body)) return true;
  if (/^\s{0,3}#{1,6}\s*prd\b/m.test(body)) return true;
  return false;
}

function extractIssueSummary(issue: GhIssue): string {
  const body = issue.body ?? "";
  const lines = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    if (/^#{1,6}\s+/u.test(line)) continue;
    if (/^[-*+]\s+/u.test(line)) continue;
    if (/^\d+\.\s+/u.test(line)) continue;
    if (/^```/u.test(line)) continue;
    return line;
  }
  return issue.title;
}

function extractFixIssueUrls(
  pullRequestBody: string,
  owner: string,
  repo: string,
): string[] {
  const candidates = new Map<number, string>();

  for (const refMatch of pullRequestBody.matchAll(/https?:\/\/\S+|#\s*\d+/g)) {
    const rawRef = refMatch[0];
    if (!rawRef) continue;
    const numberRef = rawRef.match(/^#\s*([0-9]+)$/);
    if (numberRef) {
      const issueNumber = Number(numberRef[1]);
      candidates.set(
        issueNumber,
        `https://github.com/${owner}/${repo}/issues/${issueNumber}`,
      );
      continue;
    }

    const normalized = normalizeReferenceUrl(rawRef);
    const issueIdent = parseGitHubComIssue(normalized);
    if (!issueIdent) continue;
    candidates.set(
      issueIdent.number,
      `https://github.com/${issueIdent.owner}/${issueIdent.repo}/issues/${issueIdent.number}`,
    );
  }

  return [...candidates.entries()]
    .filter(([issueNumber, issueUrl]) =>
      bodyDeclaresFix(pullRequestBody, issueNumber, issueUrl),
    )
    .map(([, issueUrl]) => issueUrl);
}

function normalizeReferenceUrl(rawRef: string): string {
  const withoutAngles = rawRef.replace(/^<|>$/g, "");
  return withoutAngles.replace(/[),.;]+$/g, "");
}

function bodyDeclaresFix(
  body: string | null,
  issueNumber: number,
  issueUrl: string,
): boolean {
  if (body == null) return false;
  const normalizedBody = normalizeParentRefText(body);
  const normalizedIssueUrl = normalizeParentRefText(issueUrl);
  const issueRef = `(?:#\\s*${issueNumber}(?!\\d)|${escapeRegExp(normalizedIssueUrl)})`;
  const re = new RegExp(
    `(?:^|\\s)(?:#+\\s*)?fix\\s*:?\\s*${issueRef}(?=\\s|$)`,
    "i",
  );
  return re.test(normalizedBody);
}

async function collectFromIssueInput(
  taskUrl: string,
  filters: LabelFilterConfig,
): Promise<GhIssue[]> {
  const issue = await loadIssueFromGh(taskUrl);

  if (hasRequiredLabels(issue, filters)) {
    if (!isEligible(issue, filters)) return [];
    return [issue];
  }

  const ident = parseGitHubComIssue(issue.url) ?? parseGitHubComIssue(taskUrl);
  if (!ident) {
    throw new Error(
      `Parent issue mode needs a github.com issue URL in issue data; url=${issue.url}`,
    );
  }
  return collectChildIssuesForParent(
    ident.owner,
    ident.repo,
    ident.number,
    taskUrl,
    filters,
  );
}

function normalizeLabelFilters(options: LabelFilterOptions): LabelFilterConfig {
  const requiredLabels = normalizeLabelList(
    options.requiredLabels ?? defaultLabelFilters.requiredLabels,
  );
  const excludedLabels = normalizeLabelList(
    options.excludedLabels ?? defaultLabelFilters.excludedLabels,
  );
  return { requiredLabels, excludedLabels };
}

function normalizeLabelList(labels: string[]): string[] {
  return [...new Set(labels.map((label) => label.trim()).filter(Boolean))];
}

function buildIssueListSearchQuery(filters: LabelFilterConfig): string {
  const quote = (value: string): string => `"${value.replaceAll('"', '\\"')}"`;
  const required = filters.requiredLabels.map(
    (label) => `label:${quote(label)}`,
  );
  const excluded = filters.excludedLabels.map(
    (label) => `-label:${quote(label)}`,
  );
  return [...required, ...excluded].join(" ");
}
