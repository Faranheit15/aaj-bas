/**
 * Where "report an issue" goes: a prefilled issue on the public repository.
 *
 * The product has no backend and no feedback endpoint (section 7), and no
 * contact address exists in the repository, so the honest destination for a
 * content problem is the same place corrections are made. The URL is composed
 * on the reader's device and nothing is sent unless they choose to submit.
 *
 * The body names the edition and the story and nothing about the reader: no
 * identifier, no visit time, no user agent. Section 23's default is to collect
 * nothing, and a prefilled form is exactly where "while we are here" data
 * collection would look harmless.
 */
import type { Story } from "@aaj-bas/schemas";

const NEW_ISSUE_URL = "https://github.com/Faranheit15/aaj-bas/issues/new";

/**
 * PRD section 6.2 item 7's four categories, as a checklist the reporter ticks.
 */
const CATEGORIES = [
  "Factual error",
  "Misleading wording",
  "Broken source",
  "Other",
] as const;

export function reportIssueHref(editionDate: string, story: Story): string {
  const url = new URL(NEW_ISSUE_URL);

  // Built through URLSearchParams so a headline or slug carrying an ampersand
  // cannot split the query into extra parameters.
  url.searchParams.set("title", `Story report: ${story.slug}`);
  url.searchParams.set("body", issueBody(editionDate, story));

  // Deliberately no `labels` parameter. GitHub answers a prefilled label that
  // does not exist on the repository with a 404, and `content-report` does not
  // exist here, so a convenience parameter would break the whole link.

  return url.toString();
}

function issueBody(editionDate: string, story: Story): string {
  const checklist = CATEGORIES.map((category) => `- [ ] ${category}`).join(
    "\n",
  );

  return [
    `Edition: ${editionDate}`,
    `Story: ${story.id}`,
    "",
    "What kind of problem is this?",
    "",
    checklist,
    "",
    "What is wrong? Please quote the wording you are reporting, if you can.",
    "",
  ].join("\n");
}
