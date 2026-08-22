/**
 * Golden fixture dataset for exact and near-duplicate detection.
 *
 * Contains labeled test pairs covering wire syndication, headline rewrites,
 * entity-sharing hard negatives, and time-delta cutoffs.
 */

import type { NormalizedFeedItem } from "../feed-normalization";

export interface GoldenDuplicateTestCase {
  readonly id: string;
  readonly description: string;
  readonly expectedMatch: boolean;
  readonly expectedType?: "exact" | "near";
  readonly itemA: NormalizedFeedItem;
  readonly itemB: NormalizedFeedItem;
}

export const GOLDEN_DUPLICATE_DATASET: readonly GoldenDuplicateTestCase[] = [
  {
    id: "wire-syndication-isro",
    description:
      "Syndicated ISRO satellite launch report with publisher suffix differences",
    expectedMatch: true,
    expectedType: "near",
    itemA: {
      sourceId: "the-hindu",
      guid: "th-isro-101",
      title:
        "ISRO launches navigation satellite NVS-02 successfully - The Hindu",
      description:
        "ISRO on Monday successfully launched navigation satellite NVS-02 aboard GSLV-F12 from Sriharikota.",
      url: "https://www.thehindu.com/sci-tech/science/isro-nvs-02-launch/article1.ece",
      publishedAt: "2026-08-20T10:30:00.000Z",
      updatedAt: null,
      contentHash: "hash-th-1",
    },
    itemB: {
      sourceId: "indian-express",
      guid: "ie-isro-202",
      title:
        "ISRO successfully launches NVS-02 navigation satellite from Sriharikota",
      description:
        "The Indian Space Research Organisation launched the second-generation navigation satellite on Monday.",
      url: "https://indianexpress.com/article/technology/science/isro-nvs-02-satellite-launch/",
      publishedAt: "2026-08-20T10:45:00.000Z",
      updatedAt: null,
      contentHash: "hash-ie-2",
    },
  },
  {
    id: "market-headline-rewrite",
    description:
      "Sensex crash with breaking tag and abbreviation differences (pts vs points)",
    expectedMatch: true,
    expectedType: "near",
    itemA: {
      sourceId: "mint",
      guid: "mint-market-1",
      title: "Sensex plunges 800 points as tech stocks drag markets - Mint",
      description:
        "Indian benchmark indices fell sharply on Friday led by IT losses.",
      url: "https://www.livemint.com/market/stock-market-news/sensex-today-live-111",
      publishedAt: "2026-08-21T09:15:00.000Z",
      updatedAt: null,
      contentHash: "hash-mint-1",
    },
    itemB: {
      sourceId: "ndtv",
      guid: "ndtv-market-2",
      title: "LIVE: Sensex drops 800 pts dragged by IT, tech shares - NDTV",
      description:
        "Sensex crashed 800 points today amid broad-based selling in IT stocks.",
      url: "https://www.ndtv.com/business/sensex-nifty-market-crash-today-222",
      publishedAt: "2026-08-21T09:30:00.000Z",
      updatedAt: null,
      contentHash: "hash-ndtv-2",
    },
  },
  {
    id: "exact-url-match",
    description: "Exact URL match across feed items",
    expectedMatch: true,
    expectedType: "exact",
    itemA: {
      sourceId: "reuters",
      guid: "guid-reuters-1",
      title: "Global oil prices steady after OPEC meeting",
      description: "Oil prices held firm on Wednesday.",
      url: "https://www.reuters.com/business/energy/oil-prices-steady-2026-08-20/",
      publishedAt: "2026-08-20T08:00:00.000Z",
      updatedAt: null,
      contentHash: "hash-reuters-1",
    },
    itemB: {
      sourceId: "reuters",
      guid: "guid-reuters-2",
      title: "Oil prices steady after OPEC meeting",
      description:
        "Oil prices held firm on Wednesday following the OPEC gathering.",
      url: "https://www.reuters.com/business/energy/oil-prices-steady-2026-08-20/",
      publishedAt: "2026-08-20T08:30:00.000Z",
      updatedAt: null,
      contentHash: "hash-reuters-2",
    },
  },
  {
    id: "hard-negative-rbi",
    description:
      "Two distinct RBI stories (repo rate decision vs bank regulatory penalty)",
    expectedMatch: false,
    itemA: {
      sourceId: "the-hindu",
      guid: "th-rbi-rate",
      title: "RBI keeps repo rate unchanged at 6.5% - The Hindu",
      description:
        "The Monetary Policy Committee decided to maintain the benchmark rate.",
      url: "https://www.thehindu.com/business/Economy/rbi-monetary-policy-rate/article1.ece",
      publishedAt: "2026-08-20T10:00:00.000Z",
      updatedAt: null,
      contentHash: "hash-rbi-1",
    },
    itemB: {
      sourceId: "ndtv",
      guid: "ndtv-rbi-fine",
      title:
        "RBI imposes Rs 5 crore penalty on private bank for KYC violations - NDTV",
      description:
        "The Reserve Bank of India found deficiencies in statutory compliance.",
      url: "https://www.ndtv.com/business/rbi-imposes-penalty-on-bank-333",
      publishedAt: "2026-08-20T11:00:00.000Z",
      updatedAt: null,
      contentHash: "hash-rbi-2",
    },
  },
  {
    id: "hard-negative-supreme-court",
    description: "Two distinct Supreme Court rulings sharing court entity name",
    expectedMatch: false,
    itemA: {
      sourceId: "indian-express",
      guid: "ie-sc-dogs",
      title: "Supreme Court stays High Court order on stray dogs relocation",
      description:
        "The bench observed that animal welfare guidelines must be strictly adhered to.",
      url: "https://indianexpress.com/article/india/sc-stray-dogs-order-stay/",
      publishedAt: "2026-08-21T07:00:00.000Z",
      updatedAt: null,
      contentHash: "hash-sc-1",
    },
    itemB: {
      sourceId: "the-hindu",
      guid: "th-sc-evm",
      title:
        "Supreme Court hears arguments on EVM-VVPAT cross verification - The Hindu",
      description:
        "A two-judge bench resumed hearing petitions seeking 100 percent counting of VVPAT slips.",
      url: "https://www.thehindu.com/news/national/supreme-court-evm-vvpat-case/article2.ece",
      publishedAt: "2026-08-21T08:00:00.000Z",
      updatedAt: null,
      contentHash: "hash-sc-2",
    },
  },
  {
    id: "hard-negative-cabinet-decisions",
    description: "Two distinct Union Cabinet approvals sharing Cabinet header",
    expectedMatch: false,
    itemA: {
      sourceId: "pib",
      guid: "pib-cab-semi",
      title: "Cabinet approves semiconductor fabrication unit in Gujarat",
      description:
        "The Union Cabinet chaired by the Prime Minister approved the project under the India Semiconductor Mission.",
      url: "https://pib.gov.in/PressReleasePage.aspx?PRID=111",
      publishedAt: "2026-08-19T14:00:00.000Z",
      updatedAt: null,
      contentHash: "hash-pib-1",
    },
    itemB: {
      sourceId: "pib",
      guid: "pib-cab-rail",
      title: "Cabinet approves new railway line corridor in Maharashtra",
      description:
        "The project aims to improve connectivity across western regions.",
      url: "https://pib.gov.in/PressReleasePage.aspx?PRID=222",
      publishedAt: "2026-08-19T14:15:00.000Z",
      updatedAt: null,
      contentHash: "hash-pib-2",
    },
  },
  {
    id: "numeric-conflict-casualties",
    description: "Differing casualty numbers in similar road accident phrasing",
    expectedMatch: false,
    itemA: {
      sourceId: "pti",
      guid: "pti-acc-5",
      title: "5 killed in road accident near Pune on expressway",
      description: "Five passengers died after a bus collided with a truck.",
      url: "https://example.com/pune-5-killed",
      publishedAt: "2026-08-20T06:00:00.000Z",
      updatedAt: null,
      contentHash: "hash-acc-1",
    },
    itemB: {
      sourceId: "ani",
      guid: "ani-acc-12",
      title: "12 killed in road accident near Pune on expressway",
      description:
        "Twelve persons lost their lives in a major expressway collision.",
      url: "https://example.com/pune-12-killed",
      publishedAt: "2026-08-20T07:00:00.000Z",
      updatedAt: null,
      contentHash: "hash-acc-2",
    },
  },
  {
    id: "time-delta-separation",
    description:
      "Identical recurring economic print title published months apart",
    expectedMatch: false,
    itemA: {
      sourceId: "mint",
      guid: "mint-cpi-jan",
      title: "CPI Inflation rises to 5.4 percent in retail market",
      description: "Retail inflation print for January recorded an uptick.",
      url: "https://example.com/cpi-jan-2026",
      publishedAt: "2026-01-12T12:00:00.000Z",
      updatedAt: null,
      contentHash: "hash-cpi-jan",
    },
    itemB: {
      sourceId: "mint",
      guid: "mint-cpi-aug",
      title: "CPI Inflation rises to 5.4 percent in retail market",
      description: "Retail inflation print for August recorded an uptick.",
      url: "https://example.com/cpi-aug-2026",
      publishedAt: "2026-08-12T12:00:00.000Z", // 7 months apart
      updatedAt: null,
      contentHash: "hash-cpi-aug",
    },
  },
];
