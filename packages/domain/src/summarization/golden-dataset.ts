/**
 * Golden prompt and summarization evaluation dataset.
 *
 * Contains 50 realistic Indian news clusters covering 10 major journalistic beats,
 * complete with expected facts, golden summaries, negative hallucination traps,
 * and dispute/uncertainty requirements.
 */

import type { GoldenClusterTestCase } from "./golden-types";

export const GOLDEN_PROMPT_DATASET: readonly GoldenClusterTestCase[] = [
  // 1. National Governance & Policy
  {
    id: "case-gov-01",
    topic: "business-economy",
    description: "Cabinet semiconductor incentive package",
    expectedReportingType: "reporting",
    requiresUncertainty: false,
    cluster: {
      id: "c-gov-01",
      primaryItem: {
        sourceId: "pti",
        guid: "g-gov-01-1",
        title:
          "Cabinet approves ₹10,000 crore incentive for semiconductor testing facilities",
        description:
          "The Union Cabinet chaired by the Prime Minister approved ₹10,000 crore financial incentives on Saturday to support semiconductor assembly, testing, marking, and packaging units.",
        url: "https://example.com/gov/1",
        publishedAt: "2026-08-22T10:00:00.000Z",
        updatedAt: null,
        contentHash: "h-gov-01-1",
      },
      items: [
        {
          sourceId: "pti",
          guid: "g-gov-01-1",
          title:
            "Cabinet approves ₹10,000 crore incentive for semiconductor testing facilities",
          description:
            "The Union Cabinet chaired by the Prime Minister approved ₹10,000 crore financial incentives on Saturday to support semiconductor assembly, testing, marking, and packaging units.",
          url: "https://example.com/gov/1",
          publishedAt: "2026-08-22T10:00:00.000Z",
          updatedAt: null,
          contentHash: "h-gov-01-1",
        },
        {
          sourceId: "the-hindu",
          guid: "g-gov-01-2",
          title:
            "Union Cabinet clears ₹10,000 crore package for semiconductor ATMP units",
          description:
            "Government expands India Semiconductor Mission with fresh capital subsidies for packaging plants.",
          url: "https://example.com/gov/2",
          publishedAt: "2026-08-22T10:15:00.000Z",
          updatedAt: null,
          contentHash: "h-gov-01-2",
        },
      ],
      sourceCount: 2,
      sources: ["pti", "the-hindu"],
      representativeTitle:
        "Cabinet approves ₹10,000 crore incentive for semiconductor testing facilities",
      cleanedTitle:
        "Cabinet approves ₹10,000 crore incentive for semiconductor testing facilities",
      confidenceScore: 1.0,
      mergeReasons: [],
      firstPublishedAt: "2026-08-22T10:00:00.000Z",
      lastPublishedAt: "2026-08-22T10:15:00.000Z",
    },
    expectedFacts: {
      namedEntities: ["Union Cabinet", "India Semiconductor Mission"],
      numbers: ["10000", "₹10,000 crore"],
      dates: ["2026-08-22", "Saturday"],
    },
    forbiddenHallucinations: ["Foxconn", "TSMC", "₹50,000 crore", "5nm chips"],
    goldenResult: {
      headline:
        "Union Cabinet approves ₹10,000 crore incentive for semiconductor testing",
      deck: "Fresh capital subsidies aim to expand packaging and testing infrastructure.",
      whatChanged: [
        {
          sentence:
            "The Union Cabinet approved a ₹10,000 crore incentive package on Saturday to establish semiconductor assembly and testing units.",
          sourceIds: ["pti", "the-hindu"],
        },
      ],
      whyItMatters:
        "Strengthens domestic electronics manufacturing supply chains under the India Semiconductor Mission.",
      reportingType: "reporting",
      extractedFacts: {
        namedEntities: ["Union Cabinet", "India Semiconductor Mission"],
        numbers: ["10000", "₹10,000 crore"],
        dates: ["2026-08-22", "Saturday"],
      },
    },
    negativeSamples: [
      {
        name: "Hallucinated 50000 crore number",
        story: {
          whatChanged: [
            "The Union Cabinet approved a ₹50,000 crore subsidy for semiconductor plants on Saturday.",
          ],
        },
        expectedBlockedRule: "fact/number-containment",
      },
      {
        name: "Hallucinated foreign company entity",
        story: {
          headline:
            "TSMC and Foxconn partner with Union Cabinet for testing units",
        },
        expectedBlockedRule: "fact/entity-containment",
      },
    ],
  },

  // 2. Macroeconomy: RBI Repo Rate
  {
    id: "case-econ-01",
    topic: "business-economy",
    description: "RBI MPC holds repo rate at 6.50%",
    expectedReportingType: "reporting",
    requiresUncertainty: false,
    cluster: {
      id: "c-econ-01",
      primaryItem: {
        sourceId: "pti",
        guid: "g-econ-01-1",
        title:
          "RBI keeps repo rate unchanged at 6.50% for eighth consecutive meeting",
        description:
          "The Reserve Bank of India Monetary Policy Committee decided by 4-2 majority to hold the policy repo rate at 6.50% on Friday.",
        url: "https://example.com/econ/1",
        publishedAt: "2026-08-22T08:00:00.000Z",
        updatedAt: null,
        contentHash: "h-econ-01-1",
      },
      items: [
        {
          sourceId: "pti",
          guid: "g-econ-01-1",
          title:
            "RBI keeps repo rate unchanged at 6.50% for eighth consecutive meeting",
          description:
            "The Reserve Bank of India Monetary Policy Committee decided by 4-2 majority to hold the policy repo rate at 6.50% on Friday.",
          url: "https://example.com/econ/1",
          publishedAt: "2026-08-22T08:00:00.000Z",
          updatedAt: null,
          contentHash: "h-econ-01-1",
        },
      ],
      sourceCount: 1,
      sources: ["pti"],
      representativeTitle:
        "RBI keeps repo rate unchanged at 6.50% for eighth consecutive meeting",
      cleanedTitle:
        "RBI keeps repo rate unchanged at 6.50% for eighth consecutive meeting",
      confidenceScore: 1.0,
      mergeReasons: [],
      firstPublishedAt: "2026-08-22T08:00:00.000Z",
      lastPublishedAt: "2026-08-22T08:00:00.000Z",
    },
    expectedFacts: {
      namedEntities: [
        "Reserve Bank of India",
        "Monetary Policy Committee",
        "RBI",
      ],
      numbers: ["6.50", "6.50%", "4-2", "8"],
      dates: ["2026-08-22", "Friday"],
    },
    forbiddenHallucinations: [
      "7.25%",
      "Shaktikanta Das announced rate cut",
      "50 bps reduction",
    ],
    goldenResult: {
      headline: "RBI keeps benchmark repo rate unchanged at 6.50%",
      deck: "Monetary Policy Committee votes 4-2 to maintain policy rate.",
      whatChanged: [
        {
          sentence:
            "The Reserve Bank of India kept the policy repo rate unchanged at 6.50% following a 4-2 vote by the Monetary Policy Committee on Friday.",
          sourceIds: ["pti"],
        },
      ],
      whyItMatters:
        "Maintains existing borrowing costs across home loans and corporate debt.",
      reportingType: "reporting",
      extractedFacts: {
        namedEntities: [
          "Reserve Bank of India",
          "Monetary Policy Committee",
          "RBI",
        ],
        numbers: ["6.50", "6.50%", "4-2"],
        dates: ["2026-08-22", "Friday"],
      },
    },
    negativeSamples: [
      {
        name: "Hallucinated rate reduction",
        story: {
          whatChanged: [
            "The Reserve Bank of India cut repo rates to 5.75% on Friday.",
          ],
        },
        expectedBlockedRule: "fact/number-containment",
      },
    ],
  },

  // 3. Science & Space: ISRO Gaganyaan Engine Test
  {
    id: "case-sci-01",
    topic: "science-health-climate",
    description: "ISRO Gaganyaan engine test",
    expectedReportingType: "reporting",
    requiresUncertainty: false,
    cluster: {
      id: "c-sci-01",
      primaryItem: {
        sourceId: "pti",
        guid: "g-sci-01-1",
        title:
          "ISRO successfully hot tests Gaganyaan liquid rocket engine for 720 seconds",
        description:
          "The Indian Space Research Organisation completed a 720-second test firing of the CE-20 cryogenic engine at Mahendragiri facility in Tamil Nadu.",
        url: "https://example.com/sci/1",
        publishedAt: "2026-08-22T09:00:00.000Z",
        updatedAt: null,
        contentHash: "h-sci-01-1",
      },
      items: [
        {
          sourceId: "pti",
          guid: "g-sci-01-1",
          title:
            "ISRO successfully hot tests Gaganyaan liquid rocket engine for 720 seconds",
          description:
            "The Indian Space Research Organisation completed a 720-second test firing of the CE-20 cryogenic engine at Mahendragiri facility in Tamil Nadu.",
          url: "https://example.com/sci/1",
          publishedAt: "2026-08-22T09:00:00.000Z",
          updatedAt: null,
          contentHash: "h-sci-01-1",
        },
      ],
      sourceCount: 1,
      sources: ["pti"],
      representativeTitle:
        "ISRO successfully hot tests Gaganyaan liquid rocket engine for 720 seconds",
      cleanedTitle:
        "ISRO successfully hot tests Gaganyaan liquid rocket engine for 720 seconds",
      confidenceScore: 1.0,
      mergeReasons: [],
      firstPublishedAt: "2026-08-22T09:00:00.000Z",
      lastPublishedAt: "2026-08-22T09:00:00.000Z",
    },
    expectedFacts: {
      namedEntities: [
        "ISRO",
        "Gaganyaan",
        "CE-20",
        "Mahendragiri",
        "Tamil Nadu",
        "Indian Space Research Organisation",
      ],
      numbers: ["720", "720-second"],
      dates: ["2026-08-22"],
    },
    forbiddenHallucinations: [
      "Astronauts launched into space",
      "NASA Artemis",
      "1,500 seconds",
    ],
    goldenResult: {
      headline: "ISRO completes 720-second engine test for Gaganyaan mission",
      deck: "Cryogenic engine firing completed successfully at Mahendragiri facility.",
      whatChanged: [
        {
          sentence:
            "ISRO successfully fired the CE-20 cryogenic engine for 720 seconds at its Mahendragiri facility in Tamil Nadu.",
          sourceIds: ["pti"],
        },
      ],
      whyItMatters:
        "Validates propulsion reliability for India's upcoming human spaceflight mission.",
      reportingType: "reporting",
      extractedFacts: {
        namedEntities: [
          "ISRO",
          "CE-20",
          "Gaganyaan",
          "Mahendragiri",
          "Tamil Nadu",
        ],
        numbers: ["720"],
        dates: ["2026-08-22"],
      },
    },
    negativeSamples: [
      {
        name: "Hallucinated crew launch",
        story: {
          whatChanged: [
            "ISRO launched four astronauts into low Earth orbit for 720 hours.",
          ],
        },
        expectedBlockedRule: "fact/number-containment",
      },
    ],
  },

  // 4. Numeric Conflict Case: Disputed Casualty Figures
  {
    id: "case-dispute-01",
    topic: "india",
    description:
      "Factory incident with conflicting casualty numbers across wires",
    expectedReportingType: "reporting",
    requiresUncertainty: true,
    cluster: {
      id: "c-dispute-01",
      primaryItem: {
        sourceId: "pti",
        guid: "g-disp-01-1",
        title:
          "Fire breaks out in chemical unit: 4 workers dead in boiler blast",
        description:
          "Officials confirmed four casualties after an industrial explosion in Thane.",
        url: "https://example.com/disp/1",
        publishedAt: "2026-08-22T06:00:00.000Z",
        updatedAt: null,
        contentHash: "h-disp-01-1",
      },
      items: [
        {
          sourceId: "pti",
          guid: "g-disp-01-1",
          title:
            "Fire breaks out in chemical unit: 4 workers dead in boiler blast",
          description:
            "Officials confirmed four casualties after an industrial explosion in Thane.",
          url: "https://example.com/disp/1",
          publishedAt: "2026-08-22T06:00:00.000Z",
          updatedAt: null,
          contentHash: "h-disp-01-1",
        },
        {
          sourceId: "the-hindu",
          guid: "g-disp-01-2",
          title: "Chemical unit fire: 7 workers killed in Thane explosion",
          description:
            "Rescue teams recovered seven bodies from the collapsed structure.",
          url: "https://example.com/disp/2",
          publishedAt: "2026-08-22T06:30:00.000Z",
          updatedAt: null,
          contentHash: "h-disp-01-2",
        },
      ],
      sourceCount: 2,
      sources: ["pti", "the-hindu"],
      representativeTitle:
        "Fire breaks out in chemical unit: workers killed in boiler blast",
      cleanedTitle:
        "Fire breaks out in chemical unit: workers killed in boiler blast",
      confidenceScore: 0.8,
      mergeReasons: [],
      firstPublishedAt: "2026-08-22T06:00:00.000Z",
      lastPublishedAt: "2026-08-22T06:30:00.000Z",
    },
    expectedFacts: {
      namedEntities: ["Thane"],
      numbers: ["4", "7"],
      dates: ["2026-08-22"],
    },
    forbiddenHallucinations: ["100 killed", "terrorist attack"],
    goldenResult: {
      headline: "Industrial explosion reported at Thane chemical unit",
      deck: "Rescue operations underway following boiler blast.",
      whatChanged: [
        {
          sentence:
            "A fire and explosion at a chemical unit in Thane caused multiple worker casualties on Saturday.",
          sourceIds: ["pti", "the-hindu"],
        },
      ],
      whyItMatters:
        "Highlights workplace safety oversight and emergency response in industrial corridors.",
      uncertainty:
        "Casualty counts vary between initial wire reports, with PTI confirming 4 fatalities and The Hindu reporting 7.",
      reportingType: "reporting",
      extractedFacts: {
        namedEntities: ["Thane"],
        numbers: ["4", "7"],
        dates: ["2026-08-22"],
      },
    },
    negativeSamples: [
      {
        name: "Conflicting numbers presented without uncertainty text",
        story: {
          whatChanged: ["A blast in Thane killed 7 workers on Saturday."],
          uncertainty: undefined,
          confidence: "multi-source",
        },
        expectedBlockedRule: "fact/uncertainty-on-conflict",
      },
    ],
  },

  // 5. Opinion / Editorial Column Classification
  {
    id: "case-op-01",
    topic: "policy-geopolitics",
    description: "Pure editorial column on green hydrogen strategy",
    expectedReportingType: "opinion",
    requiresUncertainty: false,
    cluster: {
      id: "c-op-01",
      primaryItem: {
        sourceId: "the-hindu",
        guid: "g-op-01-1",
        title:
          "Editorial: Evaluating India's green hydrogen transition roadmap",
        description:
          "An opinion column analyzing infrastructure subsidies and carbon pricing hurdles.",
        url: "https://example.com/op/1",
        publishedAt: "2026-08-22T05:00:00.000Z",
        updatedAt: null,
        contentHash: "h-op-01-1",
      },
      items: [
        {
          sourceId: "the-hindu",
          guid: "g-op-01-1",
          title:
            "Editorial: Evaluating India's green hydrogen transition roadmap",
          description:
            "An opinion column analyzing infrastructure subsidies and carbon pricing hurdles.",
          url: "https://example.com/op/1",
          publishedAt: "2026-08-22T05:00:00.000Z",
          updatedAt: null,
          contentHash: "h-op-01-1",
        },
      ],
      sourceCount: 1,
      sources: ["the-hindu"],
      representativeTitle:
        "Editorial: Evaluating India's green hydrogen transition roadmap",
      cleanedTitle: "Evaluating India's green hydrogen transition roadmap",
      confidenceScore: 1.0,
      mergeReasons: [],
      firstPublishedAt: "2026-08-22T05:00:00.000Z",
      lastPublishedAt: "2026-08-22T05:00:00.000Z",
    },
    expectedFacts: {
      namedEntities: ["India", "The Hindu"],
      numbers: [],
      dates: ["2026-08-22"],
    },
    forbiddenHallucinations: ["Government banned coal today"],
    goldenResult: {
      headline:
        "Analysis examines infrastructure hurdles in green hydrogen roadmap",
      deck: "Editorial focuses on carbon pricing and clean energy subsidies.",
      whatChanged: [
        {
          sentence:
            "An editorial analysis in The Hindu outlines capital challenges facing India's green hydrogen transition.",
          sourceIds: ["the-hindu"],
        },
      ],
      whyItMatters:
        "Provides economic perspective on industrial decarbonization policies.",
      reportingType: "opinion",
      extractedFacts: {
        namedEntities: ["India", "The Hindu"],
        numbers: [],
        dates: ["2026-08-22"],
      },
    },
    negativeSamples: [
      {
        name: "Editorial column labeled as objective reporting",
        story: {
          reportingType: "reporting",
        },
        expectedBlockedRule: "fact/editorial-alignment",
      },
    ],
  },
];

// Helper to generate the complete 50-item dataset deterministically covering all 10 beats
function generateFull50GoldenDataset(): GoldenClusterTestCase[] {
  const dataset: GoldenClusterTestCase[] = [...GOLDEN_PROMPT_DATASET];

  const beats: Array<{
    topic: GoldenClusterTestCase["topic"];
    reportingType: GoldenClusterTestCase["expectedReportingType"];
    titlePrefix: string;
    entity: string;
    number: string;
    date: string;
  }> = [
    // 6-10: Governance & National
    {
      topic: "india",
      reportingType: "reporting",
      titlePrefix: "Digital India Act framework released for public comments",
      entity: "Ministry of Electronics and Information Technology",
      number: "45",
      date: "2026-08-22",
    },
    {
      topic: "india",
      reportingType: "reporting",
      titlePrefix:
        "Railway safety initiative installs Kavach across trunk routes",
      entity: "Indian Railways",
      number: "3000",
      date: "2026-08-22",
    },
    {
      topic: "india",
      reportingType: "reporting",
      titlePrefix: "National Highway authority expands corridor network",
      entity: "National Highways Authority of India",
      number: "25000",
      date: "2026-08-22",
    },
    {
      topic: "india",
      reportingType: "reporting",
      titlePrefix:
        "Civil services reform panel recommends administrative guidelines",
      entity: "Union Public Service Commission",
      number: "12",
      date: "2026-08-22",
    },
    {
      topic: "india",
      reportingType: "official",
      titlePrefix:
        "Official: Press Information Bureau releases annual governance report",
      entity: "Press Information Bureau",
      number: "100",
      date: "2026-08-22",
    },

    // 11-15: Economy & Business
    {
      topic: "business-economy",
      reportingType: "reporting",
      titlePrefix: "India retail inflation eases to 4.75% in monthly print",
      entity: "National Statistical Office",
      number: "4.75",
      date: "2026-08-22",
    },
    {
      topic: "business-economy",
      reportingType: "reporting",
      titlePrefix: "Gross GST collections reach ₹1.73 lakh crore in May",
      entity: "Ministry of Finance",
      number: "1.73",
      date: "2026-08-22",
    },
    {
      topic: "business-economy",
      reportingType: "reporting",
      titlePrefix: "Rupee stabilizes at 83.45 against US dollar",
      entity: "Foreign Exchange Market",
      number: "83.45",
      date: "2026-08-22",
    },
    {
      topic: "business-economy",
      reportingType: "reporting",
      titlePrefix: "Sensex crosses 77,000 threshold led by financial shares",
      entity: "Bombay Stock Exchange",
      number: "77000",
      date: "2026-08-22",
    },
    {
      topic: "business-economy",
      reportingType: "reporting",
      titlePrefix: "Direct tax collections grow 18% in first quarter",
      entity: "Central Board of Direct Taxes",
      number: "18",
      date: "2026-08-22",
    },

    // 16-20: Science & Technology
    {
      topic: "science-health-climate",
      reportingType: "reporting",
      titlePrefix:
        "Aditya-L1 solar observatory detects high-energy solar flare",
      entity: "ISRO",
      number: "1",
      date: "2026-08-22",
    },
    {
      topic: "technology-ai",
      reportingType: "reporting",
      titlePrefix:
        "Tata Electronics begins construction of semiconductor fabrication facility",
      entity: "Tata Electronics",
      number: "91000",
      date: "2026-08-22",
    },
    {
      topic: "science-health-climate",
      reportingType: "reporting",
      titlePrefix: "National Quantum Mission establishes 4 research hubs",
      entity: "Department of Science and Technology",
      number: "6003",
      date: "2026-08-22",
    },
    {
      topic: "technology-ai",
      reportingType: "reporting",
      titlePrefix:
        "Indigenous telecom stack deployed across 10,000 cell towers",
      entity: "Centre for Development of Telematics",
      number: "10000",
      date: "2026-08-22",
    },
    {
      topic: "science-health-climate",
      reportingType: "reporting",
      titlePrefix:
        "ICMR announces clinical trials for affordable dengue vaccine",
      entity: "Indian Council of Medical Research",
      number: "3",
      date: "2026-08-22",
    },

    // 21-25: Supreme Court & Legal
    {
      topic: "india",
      reportingType: "reporting",
      titlePrefix:
        "Supreme Court constitutional bench hears electoral transparency petition",
      entity: "Supreme Court of India",
      number: "5",
      date: "2026-08-22",
    },
    {
      topic: "india",
      reportingType: "reporting",
      titlePrefix:
        "High Court directs municipal authority to clear drainage canals",
      entity: "High Court",
      number: "30",
      date: "2026-08-22",
    },
    {
      topic: "india",
      reportingType: "reporting",
      titlePrefix:
        "Law Commission issues consultation paper on commercial arbitration",
      entity: "Law Commission of India",
      number: "22",
      date: "2026-08-22",
    },
    {
      topic: "science-health-climate",
      reportingType: "reporting",
      titlePrefix:
        "National Green Tribunal directs environmental audit of thermal plants",
      entity: "National Green Tribunal",
      number: "50",
      date: "2026-08-22",
    },
    {
      topic: "india",
      reportingType: "reporting",
      titlePrefix:
        "Bar Council of India notifies revised legal education guidelines",
      entity: "Bar Council of India",
      number: "3",
      date: "2026-08-22",
    },

    // 26-30: Sports
    {
      topic: "sports",
      reportingType: "reporting",
      titlePrefix:
        "BCCI announces 15-player squad for international cricket tournament",
      entity: "BCCI",
      number: "15",
      date: "2026-08-22",
    },
    {
      topic: "sports",
      reportingType: "reporting",
      titlePrefix:
        "Neeraj Chopra wins gold medal with 88.36 metre javelin throw",
      entity: "Athletics Federation of India",
      number: "88.36",
      date: "2026-08-22",
    },
    {
      topic: "sports",
      reportingType: "reporting",
      titlePrefix: "Indian badminton squad enters Thomas Cup knockout stages",
      entity: "Badminton Association of India",
      number: "4",
      date: "2026-08-22",
    },
    {
      topic: "sports",
      reportingType: "reporting",
      titlePrefix:
        "Grandmaster Praggnanandhaa wins classical chess tournament game",
      entity: "FIDE",
      number: "1",
      date: "2026-08-22",
    },
    {
      topic: "sports",
      reportingType: "reporting",
      titlePrefix: "Indian archery contingent wins 3 Olympic quota positions",
      entity: "Archery Association of India",
      number: "3",
      date: "2026-08-22",
    },

    // 31-35: Geopolitics & World
    {
      topic: "world",
      reportingType: "reporting",
      titlePrefix:
        "India and European Union conclude bilateral trade negotiation round",
      entity: "European Union",
      number: "8",
      date: "2026-08-22",
    },
    {
      topic: "world",
      reportingType: "reporting",
      titlePrefix:
        "Quad foreign ministers meet in Tokyo to discuss maritime security",
      entity: "Quad",
      number: "4",
      date: "2026-08-22",
    },
    {
      topic: "world",
      reportingType: "reporting",
      titlePrefix:
        "India signs 10-year contract to operate terminal at Chabahar port",
      entity: "Chabahar",
      number: "10",
      date: "2026-08-22",
    },
    {
      topic: "world",
      reportingType: "reporting",
      titlePrefix:
        "Prime Minister attends international outreach summit in Italy",
      entity: "G7",
      number: "7",
      date: "2026-08-22",
    },
    {
      topic: "world",
      reportingType: "reporting",
      titlePrefix:
        "India and United States expand critical technology defense partnership",
      entity: "iCET",
      number: "2",
      date: "2026-08-22",
    },

    // 36-40: Regional Governance & States
    {
      topic: "india",
      reportingType: "reporting",
      titlePrefix:
        "Election Commission announces polling schedule for assembly elections",
      entity: "Election Commission of India",
      number: "4",
      date: "2026-08-22",
    },
    {
      topic: "india",
      reportingType: "reporting",
      titlePrefix:
        "Karnataka government expands monthly financial assistance scheme",
      entity: "Government of Karnataka",
      number: "2000",
      date: "2026-08-22",
    },
    {
      topic: "business-economy",
      reportingType: "reporting",
      titlePrefix:
        "Andhra Pradesh cabinet approves industrial development policy",
      entity: "Government of Andhra Pradesh",
      number: "50000",
      date: "2026-08-22",
    },
    {
      topic: "india",
      reportingType: "reporting",
      titlePrefix:
        "Maharashtra government allocates drought relief fund for farmers",
      entity: "Government of Maharashtra",
      number: "15000",
      date: "2026-08-22",
    },
    {
      topic: "science-health-climate",
      reportingType: "reporting",
      titlePrefix:
        "Tamil Nadu commissions 500 MW offshore wind energy facility",
      entity: "Tamil Nadu",
      number: "500",
      date: "2026-08-22",
    },

    // 41-45: Climate, Agriculture & Monsoon
    {
      topic: "science-health-climate",
      reportingType: "reporting",
      titlePrefix:
        "IMD forecasts normal southwest monsoon at 106% of long period average",
      entity: "India Meteorological Department",
      number: "106",
      date: "2026-08-22",
    },
    {
      topic: "business-economy",
      reportingType: "reporting",
      titlePrefix: "Cabinet hikes minimum support price for Kharif crops",
      entity: "Cabinet Committee on Economic Affairs",
      number: "14",
      date: "2026-08-22",
    },
    {
      topic: "science-health-climate",
      reportingType: "reporting",
      titlePrefix:
        "Heatwave alert issued across northern states as temperature reaches 48°C",
      entity: "IMD",
      number: "48",
      date: "2026-08-22",
    },
    {
      topic: "science-health-climate",
      reportingType: "reporting",
      titlePrefix:
        "Coastal districts record 120 mm rainfall under monsoon surge",
      entity: "State Disaster Management Authority",
      number: "120",
      date: "2026-08-22",
    },
    {
      topic: "science-health-climate",
      reportingType: "reporting",
      titlePrefix: "Forest survey reports 1,500 sq km increase in green cover",
      entity: "Forest Survey of India",
      number: "1500",
      date: "2026-08-22",
    },

    // 46-50: Culture, Education & Syndicated Wire Challenges
    {
      topic: "culture-entertainment",
      reportingType: "reporting",
      titlePrefix: "UGC notifies four-year undergraduate curriculum guidelines",
      entity: "University Grants Commission",
      number: "4",
      date: "2026-08-22",
    },
    {
      topic: "culture-entertainment",
      reportingType: "reporting",
      titlePrefix:
        "Archaeological survey excavates Harappan settlement in Rakhigarhi",
      entity: "Archaeological Survey of India",
      number: "5000",
      date: "2026-08-22",
    },
    {
      topic: "culture-entertainment",
      reportingType: "reporting",
      titlePrefix:
        "Sahitya Akademi announces youth literary awards across 24 languages",
      entity: "Sahitya Akademi",
      number: "24",
      date: "2026-08-22",
    },
    {
      topic: "culture-entertainment",
      reportingType: "reporting",
      titlePrefix:
        "International Yoga Day demonstrations organized in 190 countries",
      entity: "Ministry of Ayush",
      number: "190",
      date: "2026-08-22",
    },
    {
      topic: "india",
      reportingType: "reporting",
      titlePrefix:
        "National Archives digitizes 5 lakh historical documents under mission",
      entity: "National Archives of India",
      number: "500000",
      date: "2026-08-22",
    },
  ];

  for (let i = 0; i < beats.length; i += 1) {
    const item = beats[i];
    if (!item) continue;

    const caseNum = i + 6;
    const caseId = `case-${item.topic.slice(0, 4)}-${String(caseNum).padStart(2, "0")}`;
    const clusterId = `c-gen-${String(caseNum).padStart(2, "0")}`;

    const title = `${item.titlePrefix} with ${item.number} milestone`;
    const desc = `${item.entity} announced new developments on ${item.date}.`;

    const cluster = {
      id: clusterId,
      primaryItem: {
        sourceId: "pti",
        guid: `g-gen-${caseNum}-1`,
        title,
        description: desc,
        url: `https://example.com/item/${caseNum}/1`,
        publishedAt: `${item.date}T10:00:00.000Z`,
        updatedAt: null,
        contentHash: `h-gen-${caseNum}-1`,
      },
      items: [
        {
          sourceId: "pti",
          guid: `g-gen-${caseNum}-1`,
          title,
          description: desc,
          url: `https://example.com/item/${caseNum}/1`,
          publishedAt: `${item.date}T10:00:00.000Z`,
          updatedAt: null,
          contentHash: `h-gen-${caseNum}-1`,
        },
        {
          sourceId: "the-hindu",
          guid: `g-gen-${caseNum}-2`,
          title: `${item.titlePrefix} details released`,
          description: `${item.entity} confirmed the ${item.number} figures on Saturday.`,
          url: `https://example.com/item/${caseNum}/2`,
          publishedAt: `${item.date}T10:30:00.000Z`,
          updatedAt: null,
          contentHash: `h-gen-${caseNum}-2`,
        },
      ],
      sourceCount: 2,
      sources: ["pti", "the-hindu"],
      representativeTitle: title,
      cleanedTitle: item.titlePrefix,
      confidenceScore: 1.0,
      mergeReasons: [],
      firstPublishedAt: `${item.date}T10:00:00.000Z`,
      lastPublishedAt: `${item.date}T10:30:00.000Z`,
    };

    const goldenResult = {
      headline: `${item.titlePrefix} confirmed`,
      deck: `${item.entity} outlines key implementation steps.`,
      whatChanged: [
        {
          sentence: `${item.entity} announced ${item.number} milestone parameters during the ${item.date} briefing.`,
          sourceIds: ["pti", "the-hindu"],
        },
      ],
      whyItMatters: `Sets national operational direction under ${item.entity} guidelines.`,
      reportingType: item.reportingType,
      extractedFacts: {
        namedEntities: [item.entity],
        numbers: [item.number],
        dates: [item.date],
      },
    };

    dataset.push({
      id: caseId,
      topic: item.topic,
      description: item.titlePrefix,
      cluster,
      expectedReportingType: item.reportingType,
      expectedFacts: {
        namedEntities: [item.entity],
        numbers: [item.number],
        dates: [item.date],
      },
      forbiddenHallucinations: [
        "Unfounded 999999 stat",
        "Invented foreign agency",
      ],
      requiresUncertainty: false,
      goldenResult,
      negativeSamples: [
        {
          name: "Invented number trap",
          story: {
            whatChanged: [
              `${item.entity} announced 999999 ungrounded metrics.`,
            ],
          },
          expectedBlockedRule: "fact/number-containment",
        },
      ],
    });
  }

  return dataset;
}

export const GOLDEN_PROMPT_DATASET_FULL: readonly GoldenClusterTestCase[] =
  generateFull50GoldenDataset();
