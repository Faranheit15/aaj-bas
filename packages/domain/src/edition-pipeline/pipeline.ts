/**
 * Pure domain orchestration for draft edition generation.
 *
 * Implements the 10-stage pipeline connecting feed normalization, deduplication,
 * clustering, candidate ranking, story summarization, factual support validation,
 * and editorial rule enforcement.
 */

import {
  type Edition,
  type InterestSlug,
  type SourceReference,
  type Story,
  editionSchema,
} from "@aaj-bas/schemas";
import { rankAndComposeCandidates } from "../candidate-ranking";
import { type StoryCluster, clusterFeedItems } from "../clustering";
import { validateEdition } from "../edition-validation";
import { validateFactualSupport } from "../factual-validation";
import {
  type NormalizedFeedItem,
  deduplicateFeedItems,
  normalizeFeedItems,
} from "../feed-normalization";
import {
  applyReviewedReportingType,
  clusterForGeneratedSummary,
  DeterministicFallbackSummarizer,
} from "../summarization";
import { formatDraftEditionSummaryMarkdown } from "./format-summary-markdown";
import type { DraftEditionPipelineResult, EditionPipelineInput } from "./types";

const EDITORIAL_TIME_ZONE = "Asia/Kolkata";

/** Return the edition calendar date in the product's explicit editorial zone. */
export function editorialDateInIndia(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: EDITORIAL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const valueFor = (type: "year" | "month" | "day"): string => {
    const value = parts.find((part) => part.type === type)?.value;
    if (value === undefined) {
      throw new Error(`editorial date is missing its ${type} component`);
    }
    return value;
  };

  return `${valueFor("year")}-${valueFor("month")}-${valueFor("day")}`;
}

export async function generateDraftEditionPipeline(
  input: EditionPipelineInput,
): Promise<DraftEditionPipelineResult> {
  const startTime = Date.now();

  // 1. Resolve target edition date (YYYY-MM-DD)
  const editionDate = input.date ?? editorialDateInIndia();
  const fixtureMode = input.ingestionDiagnostics?.fixtureMode === true;
  const nowIso = fixtureMode
    ? `${editionDate}T00:00:00.000Z`
    : new Date().toISOString();

  // 2. Normalization and Deduplication
  let normalizedItems: NormalizedFeedItem[] = [];
  let totalRawItems = 0;

  if (input.normalizedItems && input.normalizedItems.length > 0) {
    normalizedItems = [...input.normalizedItems];
    totalRawItems = normalizedItems.length;
  } else if (input.rawItemsBySource) {
    for (const [sourceId, rawItems] of input.rawItemsBySource.entries()) {
      totalRawItems += rawItems.length;
      const normalized = normalizeFeedItems(sourceId, rawItems);
      const deduped = deduplicateFeedItems(normalized);
      normalizedItems.push(...deduped);
    }
  }

  // 3. Story Clustering
  const clusters = clusterFeedItems(normalizedItems);

  // 4. Candidate Ranking and Composition
  const rankingResult = rankAndComposeCandidates(clusters, {
    referenceDate: editionDate,
    ...input.rankingOptions,
    sourceRegistry: input.sourceRegistry,
  });

  // 5. Story Summarization
  const summarizer = input.summarizer ?? new DeterministicFallbackSummarizer();

  const clusterByStoryId = new Map<string, (typeof clusters)[number]>();
  const coreStories: Story[] = [];

  for (const candidate of rankingResult.coreCandidates) {
    const summaryCluster = clusterForGeneratedSummary(
      candidate.cluster,
      input.sourceRegistry,
    );
    if (summaryCluster === undefined) {
      continue;
    }

    const summaryOutput = await summarizer.summarize({
      cluster: summaryCluster,
      sourceRegistry: input.sourceRegistry,
      topic: candidate.topic,
      editionDate,
      candidate,
    });
    const story = applyReviewedReportingType(
      summaryOutput.story,
      input.sourceRegistry,
    );
    assertStorySourcesArePermitted(story, summaryCluster);
    coreStories.push(story);
    clusterByStoryId.set(story.id, summaryCluster);
  }

  const poolStories: Story[] = [];
  const interestPools: Partial<Record<InterestSlug, string[]>> = {};

  for (const [topic, poolCandidates] of Object.entries(
    rankingResult.topicPools,
  )) {
    if (!poolCandidates || poolCandidates.length === 0) continue;
    const interest = topic as InterestSlug;
    interestPools[interest] = [];
    for (const candidate of poolCandidates.slice(0, 3)) {
      const summaryCluster = clusterForGeneratedSummary(
        candidate.cluster,
        input.sourceRegistry,
      );
      if (summaryCluster === undefined) {
        continue;
      }

      const summaryOutput = await summarizer.summarize({
        cluster: summaryCluster,
        sourceRegistry: input.sourceRegistry,
        topic: candidate.topic,
        editionDate,
        candidate,
      });
      const story = applyReviewedReportingType(
        summaryOutput.story,
        input.sourceRegistry,
      );
      assertStorySourcesArePermitted(story, summaryCluster);
      poolStories.push(story);
      interestPools[interest]?.push(story.id);
      clusterByStoryId.set(story.id, summaryCluster);
    }
  }

  const allStories = [...coreStories, ...poolStories];

  // 6. Source References Resolution
  const citedSourceIds = new Set<string>();
  for (const s of allStories) {
    for (const src of s.sourceIds) {
      citedSourceIds.add(src);
    }
  }

  const sourceReferences: SourceReference[] = [];
  for (const sourceId of citedSourceIds) {
    const registrySource = input.sourceRegistry?.sources.find(
      (s) => s.id === sourceId,
    );

    const matchingItems = normalizedItems.filter(
      (item) => item.sourceId === sourceId && item.publishedAt,
    );
    let resolvedPublishedAt = nowIso;
    if (matchingItems.length > 0) {
      const minMs = Math.min(
        ...matchingItems
          .map((item) =>
            item.publishedAt === null
              ? Number.NaN
              : Date.parse(item.publishedAt),
          )
          .filter(Number.isFinite),
      );
      if (Number.isFinite(minMs)) {
        resolvedPublishedAt = new Date(minMs).toISOString();
      }
    }

    const clusterItemWithSource = normalizedItems.find(
      (item) => item.sourceId === sourceId,
    );

    const resolvedUrl =
      clusterItemWithSource?.url ||
      registrySource?.siteUrl ||
      registrySource?.feedUrl ||
      "https://example.com/source";

    const resolvedPublisher =
      registrySource?.publisher || formatSourceIdToName(sourceId);

    const resolvedTitle =
      clusterItemWithSource?.title || `Reporting from ${resolvedPublisher}`;

    const resolvedSourceType =
      registrySource?.sourceType === "official" ||
      registrySource?.sourceType === "primary" ||
      registrySource?.sourceType === "research" ||
      registrySource?.sourceType === "publisher"
        ? registrySource.sourceType
        : ("publisher" as const);

    const resolvedAttribution =
      registrySource !== undefined && "attribution" in registrySource
        ? registrySource.attribution
        : undefined;
    const resolvedTermsUrl =
      registrySource !== undefined && "termsUrl" in registrySource
        ? registrySource.termsUrl
        : undefined;
    const resolvedLicenseUrl =
      registrySource !== undefined && "licenseUrl" in registrySource
        ? registrySource.licenseUrl
        : undefined;
    const citedItems = [...clusterByStoryId.values()]
      .flatMap((cluster) => cluster.items)
      .filter((item) => item.sourceId === sourceId);
    const resolvedAuthors = [
      ...new Set(
        citedItems.flatMap((item) =>
          item.author === undefined || item.author.trim() === ""
            ? []
            : [item.author],
        ),
      ),
    ].slice(0, 10);

    sourceReferences.push({
      id: sourceId,
      publisher: resolvedPublisher,
      title: resolvedTitle,
      url: resolvedUrl,
      sourceType: resolvedSourceType,
      publishedAt: resolvedPublishedAt,
      ...(resolvedAttribution === undefined
        ? {}
        : { attribution: resolvedAttribution }),
      ...(resolvedAuthors.length === 0 ? {} : { authors: resolvedAuthors }),
      ...(resolvedTermsUrl === undefined ? {} : { termsUrl: resolvedTermsUrl }),
      ...(resolvedLicenseUrl === undefined
        ? {}
        : { licenseUrl: resolvedLicenseUrl }),
    });
  }

  // Calculate estimated reading minutes (PRD section 5.1: 220 words per minute over visible stories)
  const countStoryVisibleWords = (story: Story) => {
    const parts = [
      story.deck,
      ...story.whatChanged,
      story.whyItMatters,
      story.uncertainty ?? "",
    ];
    return parts.join(" ").split(/\s+/).filter(Boolean).length;
  };

  const sortedPool = [...poolStories].sort((a, b) => {
    const diff = countStoryVisibleWords(b) - countStoryVisibleWords(a);
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });

  const visibleStoriesList = [...coreStories, ...sortedPool.slice(0, 2)];
  const totalVisibleWords = visibleStoriesList.reduce(
    (total, story) => total + countStoryVisibleWords(story),
    0,
  );
  const estimatedMinutes = Math.max(
    1,
    Math.min(60, Math.ceil(totalVisibleWords / 220)),
  );

  const draftEdition: Edition = {
    schemaVersion: 1,
    date: editionDate,
    editionVersion: 1,
    status: "draft",
    publishedAt: nowIso,
    updatedAt: nowIso,
    estimatedMinutes,
    coreStoryIds: coreStories.map((s) => s.id),
    interestPools,
    stories: allStories,
    sources: sourceReferences,
    correctionNotes: [],
  };

  // 8. Validate Edition Schema
  const parseResult = editionSchema.safeParse(draftEdition);
  const validatedEdition = parseResult.success
    ? parseResult.data
    : draftEdition;

  // 9. Validate Factual Support
  const factualValidationInputs: Array<{
    story: Story;
    cluster: StoryCluster;
  }> = [];
  for (const story of allStories) {
    const cluster = clusterByStoryId.get(story.id);
    if (cluster) {
      factualValidationInputs.push({ story, cluster });
    }
  }

  const factualReport = validateFactualSupport(
    factualValidationInputs,
    input.factualValidationOptions,
  );

  // 10. Validate Structural Edition Rules
  const editionSourceText = JSON.stringify(validatedEdition, null, 2);
  const editionValidation = validateEdition({
    file: `content/drafts/${editionDate}.json`,
    text: editionSourceText,
  });

  const distinctPublishers = new Set(sourceReferences.map((s) => s.publisher));

  const diagnostics = {
    editionDate,
    totalRawItems,
    totalNormalizedItems: normalizedItems.length,
    totalClusters: clusters.length,
    coreStoriesCount: coreStories.length,
    poolStoriesCount: poolStories.length,
    distinctPublishersCount: distinctPublishers.size,
    durationMs: fixtureMode ? 0 : Date.now() - startTime,
  };

  const hasBlockingValidationFindings = editionValidation.findings.some(
    (f) => f.severity === "blocking",
  );

  const hasBlockingIssues =
    !factualReport.passed || hasBlockingValidationFindings;

  const isPublishable = !hasBlockingIssues;

  const summaryMarkdown = formatDraftEditionSummaryMarkdown({
    edition: validatedEdition,
    rankingResult,
    factualReport,
    editionValidation,
    ingestionDiagnostics: input.ingestionDiagnostics,
    diagnostics,
  });

  return {
    edition: validatedEdition,
    editionJson: editionSourceText,
    summaryMarkdown,
    rankingResult,
    factualReport,
    editionValidation,
    ingestionDiagnostics: input.ingestionDiagnostics,
    isPublishable,
    hasBlockingIssues,
    diagnostics,
  };
}

function formatSourceIdToName(sourceId: string): string {
  return sourceId
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Fail closed if a provider returns a citation outside its reviewed input. */
function assertStorySourcesArePermitted(
  story: Story,
  summaryCluster: StoryCluster,
): void {
  const permitted = new Set(summaryCluster.sources);
  const unauthorized = story.sourceIds.filter(
    (sourceId) => !permitted.has(sourceId),
  );
  if (unauthorized.length > 0) {
    throw new Error(
      `story ${story.id} cites source(s) outside the permitted summary input: ${unauthorized.join(", ")}`,
    );
  }
}
