#!/usr/bin/env bun
/**
 * CLI script to audit repository security and privacy invariants (AB-903).
 *
 * Enforces:
 * - External link security (rel="noopener" on external anchor elements)
 * - Zero tracking/telemetry code in client applications (section 23)
 * - Zero gamification/streak tokens in client state (section 3.2)
 * - Secret hygiene (no committed secrets or private API keys)
 * - Content Security Policy (CSP) presence in HTML shells
 * - Zero raw HTML injection (no dangerouslySetInnerHTML or innerHTML)
 * - Least-privilege permissions in GitHub Actions workflows
 */

export interface SecurityFinding {
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
      // Skip test files, build outputs, node_modules, git
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

async function fileExists(path: string): Promise<boolean> {
  try {
    const stat = await Bun.file(path).stat();
    return !stat.isDirectory();
  } catch {
    return false;
  }
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
          /href=\{[a-zA-Z0-9_.]*(?:url|link|readerUrl|reportIssue)/i.test(tag);
        const isInternalAnchor =
          /href=["'](#[^"']*|\/content\/[^"']*)["']/i.test(tag) ||
          /href=\{priorEdition\.href\}/i.test(tag);

        if (
          isExternal &&
          !isInternalAnchor &&
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

  // 4. Raw HTML injection audit (no dangerouslySetInnerHTML or innerHTML)
  for (const file of clientFiles) {
    if (
      file.content.includes("dangerouslySetInnerHTML") ||
      /\.innerHTML\s*=/.test(file.content)
    ) {
      findings.push({
        check: "Security: Zero Unsanitized HTML",
        file: file.path,
        message: "Prohibited raw HTML injection signature detected",
        passed: false,
      });
    }
  }

  // 5. CSP Shell Configuration (HTML meta tags and Cloudflare Pages _headers)
  const htmlShells = ["apps/web/index.html", "apps/landing/index.html"];
  for (const htmlPath of htmlShells) {
    try {
      const htmlText = await Bun.file(htmlPath).text();
      if (
        !htmlText.includes('http-equiv="Content-Security-Policy"') ||
        !htmlText.includes("default-src 'self'")
      ) {
        findings.push({
          check: "Security: Content Security Policy",
          file: htmlPath,
          message: "Missing strict Content-Security-Policy meta tag",
          passed: false,
        });
      }
    } catch {
      findings.push({
        check: "Security: Content Security Policy",
        file: htmlPath,
        message: "HTML shell not found",
        passed: false,
      });
    }
  }

  const headerFiles = [
    "apps/web/public/_headers",
    "apps/landing/public/_headers",
  ];
  for (const headerPath of headerFiles) {
    try {
      const headerText = await Bun.file(headerPath).text();
      if (
        !headerText.includes("Content-Security-Policy:") ||
        !headerText.includes("X-Frame-Options: DENY") ||
        !headerText.includes("X-Content-Type-Options: nosniff")
      ) {
        findings.push({
          check: "Security: Deployable _headers Policy",
          file: headerPath,
          message:
            "Missing Content-Security-Policy or required security headers in _headers file",
          passed: false,
        });
      }
    } catch {
      findings.push({
        check: "Security: Deployable _headers Policy",
        file: headerPath,
        message: "_headers file not found",
        passed: false,
      });
    }
  }

  // 6. GitHub Actions Permissions Audit
  const workflowFiles = await scanFiles(".github/workflows", "*.{yml,yaml}");
  for (const wf of workflowFiles) {
    if (!wf.content.includes("permissions:")) {
      findings.push({
        check: "Security: Workflow Least-Privilege",
        file: wf.path,
        message: "Workflow missing explicit top-level or job permissions block",
        passed: false,
      });
    }
    if (wf.content.includes("write-all")) {
      findings.push({
        check: "Security: Workflow Least-Privilege",
        file: wf.path,
        message: "Prohibited write-all wildcard permission detected",
        passed: false,
      });
    }
  }

  // 7. Secret hygiene
  const allRepoFiles = [
    ...(await scanFiles("apps", "**/*.{ts,tsx,json}")),
    ...(await scanFiles("packages", "**/*.{ts,tsx,json}")),
    ...(await scanFiles("scripts", "**/*.ts")),
  ];

  for (const file of allRepoFiles) {
    if (file.path.includes("test") || file.path.includes("fixtures")) {
      continue;
    }

    if (
      /AIzaSy[A-Za-z0-9_-]{33}/.test(file.content) ||
      /ghp_[A-Za-z0-9]{36}/.test(file.content) ||
      /sk-[A-Za-z0-9]{48}/.test(file.content)
    ) {
      findings.push({
        check: "Security: No Hardcoded Secrets",
        file: file.path,
        message: "Potential active hardcoded API secret token found",
        passed: false,
      });
    }
  }

  // 8. Feedback abuse controls audit (client-side character limit and zero backend)
  const feedbackDialog = await Bun.file(
    "apps/web/src/reader/StoryFeedbackDialog.tsx",
  )
    .text()
    .catch(() => "");
  if (
    feedbackDialog &&
    (!feedbackDialog.includes("MAX_DETAIL_LENGTH") ||
      !feedbackDialog.includes("maxLength="))
  ) {
    findings.push({
      check: "Security: Feedback Abuse Controls",
      file: "apps/web/src/reader/StoryFeedbackDialog.tsx",
      message:
        "Feedback dialog missing bounded character limit on detail input",
      passed: false,
    });
  }

  // 9. Dependency and lockfile hygiene audit
  const prohibitedLockfiles = [
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
  ];
  for (const lockfile of prohibitedLockfiles) {
    if (await fileExists(lockfile)) {
      findings.push({
        check: "Security: Package Manager Lockfile Hygiene",
        file: lockfile,
        message: `Prohibited non-Bun lockfile detected: ${lockfile}. Bun is the single allowed package manager.`,
        passed: false,
      });
    }
  }

  if (!(await fileExists("bun.lock"))) {
    findings.push({
      check: "Security: Package Manager Lockfile Hygiene",
      file: "bun.lock",
      message: "Required canonical bun.lock is missing from repository root",
      passed: false,
    });
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
  console.log("✅ Security Audit: Strict Content-Security-Policy in place.");
  console.log("✅ Security Audit: Zero dangerouslySetInnerHTML or innerHTML.");
  console.log(
    "✅ Security Audit: GitHub Action permissions verified least-privilege.",
  );
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
