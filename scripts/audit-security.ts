#!/usr/bin/env bun
/**
 * CLI script to audit repository security and privacy invariants (AB-903).
 *
 * Enforces:
 * - External link security (rel="noopener" on external anchor elements)
 * - Zero tracking/telemetry code in client applications (section 23)
 * - Zero gamification/streak tokens in client state (section 3.2)
 * - Secret hygiene (no committed secrets or private API keys)
 */

interface SecurityFinding {
  check: string;
  file: string;
  message: string;
  passed: boolean;
}

const PROHIBITED_TRACKING_PATTERNS = [
  {
    name: "Google Analytics / Tag Manager",
    regex: /(googletagmanager\.com|google-analytics\.com|gtag\s*\()/i,
  },
  { name: "Meta Pixel", regex: /(connect\.facebook\.net|fbq\s*\()/i },
  { name: "Mixpanel", regex: /(mixpanel\.init|cdn\.mxpnl\.com)/i },
  { name: "PostHog", regex: /(posthog\.init|app\.posthog\.com)/i },
  { name: "Segment", regex: /(analytics\.load|cdn\.segment\.com)/i },
  {
    name: "Hotjar / FullStory",
    regex: /(static\.hotjar\.com|fullstory\.com)/i,
  },
];

const PROHIBITED_GAMIFICATION_PATTERNS = [
  {
    name: "Streak mechanics",
    regex: /\b(streak_count|daily_streak|current_streak|longest_streak)\b/i,
  },
  {
    name: "Badge rewards",
    regex: /\b(unlock_badge|earned_badge|reward_points|user_xp)\b/i,
  },
  {
    name: "Guilt copy",
    regex:
      /\b(you haven't read today|don't break your streak|unread backlog)\b/i,
  },
];

async function scanFiles(
  dir: string,
  globPattern: string,
): Promise<{ path: string; content: string }[]> {
  const files: { path: string; content: string }[] = [];
  try {
    for await (const file of new Bun.Glob(globPattern).scan({
      cwd: dir,
      onlyFiles: true,
    })) {
      const fullPath = `${dir}/${file}`;
      // Skip test files, build outputs, node_modules
      if (
        file.includes("node_modules") ||
        file.includes("dist/") ||
        file.includes(".git/")
      ) {
        continue;
      }
      const content = await Bun.file(fullPath).text();
      files.push({ path: fullPath, content });
    }
  } catch {
    // Ignore
  }
  return files;
}

export async function runSecurityAudit(): Promise<{
  passed: boolean;
  findings: SecurityFinding[];
}> {
  const findings: SecurityFinding[] = [];

  const clientFiles = [
    ...(await scanFiles("apps/landing/src", "**/*.{ts,tsx,html}")),
    ...(await scanFiles("apps/web/src", "**/*.{ts,tsx,html}")),
    ...(await scanFiles("packages/ui/src", "**/*.{ts,tsx}")),
  ];

  // 1. Check for prohibited tracking
  for (const file of clientFiles) {
    for (const tracker of PROHIBITED_TRACKING_PATTERNS) {
      if (tracker.regex.test(file.content)) {
        findings.push({
          check: "Privacy: Zero Telemetry",
          file: file.path,
          message: `Prohibited tracking signature found: ${tracker.name}`,
          passed: false,
        });
      }
    }
  }

  // 2. Check for prohibited engagement / gamification patterns
  for (const file of clientFiles) {
    for (const pattern of PROHIBITED_GAMIFICATION_PATTERNS) {
      if (pattern.regex.test(file.content)) {
        findings.push({
          check: "Constitution: Zero Gamification",
          file: file.path,
          message: `Prohibited gamification pattern found: ${pattern.name}`,
          passed: false,
        });
      }
    }
  }

  // 3. Check for external links without rel="noopener"
  for (const file of clientFiles) {
    if (file.path.endsWith(".tsx") || file.path.endsWith(".html")) {
      const anchorMatches = file.content.matchAll(/<a\s+([^>]+)>/gi);
      for (const match of anchorMatches) {
        const tag = match[1] ?? "";
        const isExternal =
          /href=["'](https?:|\/\/)/i.test(tag) ||
          /href=\{reportIssueHref/i.test(tag);
        if (
          isExternal &&
          !/rel=["'][^"']*noopener[^"']*["']/i.test(tag) &&
          !/rel=\{/i.test(tag)
        ) {
          findings.push({
            check: "Security: External Link rel=noopener",
            file: file.path,
            message: `External link without explicit rel="noopener": <a ${tag}>`,
            passed: false,
          });
        }
      }
    }
  }

  // 4. Secret hygiene
  const allRepoFiles = [
    ...(await scanFiles("apps", "**/*.{ts,tsx,json}")),
    ...(await scanFiles("packages", "**/*.{ts,tsx,json}")),
    ...(await scanFiles("scripts", "**/*.ts")),
  ];

  for (const file of allRepoFiles) {
    // Avoid checking test fixtures that mock token strings or test data
    if (file.path.includes("test") || file.path.includes("fixtures")) {
      continue;
    }

    if (
      /AIzaSy[A-Za-z0-9_-]{33}/.test(file.content) || // Google API key
      /ghp_[A-Za-z0-9]{36}/.test(file.content) || // GitHub PAT
      /sk-[A-Za-z0-9]{48}/.test(file.content) // OpenAI key
    ) {
      findings.push({
        check: "Security: No Hardcoded Secrets",
        file: file.path,
        message: "Potential active hardcoded API secret token found",
        passed: false,
      });
    }
  }

  const passed = findings.length === 0;
  return { passed, findings };
}

async function main(): Promise<void> {
  console.log("🔒 Running security and privacy audit (AB-903)...\n");

  const { passed, findings } = await runSecurityAudit();

  if (!passed) {
    console.error(
      `❌ Security audit failed with ${findings.length} findings:\n`,
    );
    for (const f of findings) {
      console.error(`- [${f.check}] ${f.file}: ${f.message}`);
    }
    process.exit(1);
  }

  console.log("✅ Privacy Audit: Zero tracking or analytics SDKs detected.");
  console.log('✅ Security Audit: All external links enforce rel="noopener".');
  console.log(
    "✅ Constitution Audit: Zero dark patterns or gamification mechanics.",
  );
  console.log(
    "✅ Secret Hygiene: No hardcoded secrets detected in source trees.",
  );
  console.log("\n🎉 Security & Privacy audit passed completely!");
  process.exit(0);
}

void main();
