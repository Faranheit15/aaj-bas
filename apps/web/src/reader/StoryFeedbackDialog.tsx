/**
 * Accessible, privacy-respecting story feedback dialog (AB-801).
 *
 * Provides category selection (factual error, misleading wording, broken source, other),
 * optional short detail text, on-device duplicate submission prevention, and offline-friendly
 * clipboard copy fallback with zero tracking or account requirements.
 */

import type { Story } from "@aaj-bas/schemas";
import type { JSX } from "react";
import { useEffect, useId, useState } from "react";
import {
  FEEDBACK_CATEGORIES,
  type FeedbackCategory,
  composeFeedbackReportText,
  reportIssueHref,
} from "./report-issue";

const COOLDOWN_SECONDS = 30;
const MAX_DETAIL_LENGTH = 500;

interface StoryFeedbackDialogProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly editionDate: string;
  readonly story: Story;
}

export function StoryFeedbackDialog({
  isOpen,
  onClose,
  editionDate,
  story,
}: StoryFeedbackDialogProps): JSX.Element | null {
  const [selectedCategory, setSelectedCategory] =
    useState<FeedbackCategory>("Factual error");
  const [detail, setDetail] = useState("");
  const [copied, setCopied] = useState(false);
  const [isCooldown, setIsCooldown] = useState(false);

  const titleId = useId();
  const descId = useId();
  const cooldownKey = `aaj_bas_fb_cooldown_${story.id}`;

  // Check cooldown status on open
  useEffect(() => {
    if (!isOpen) {
      setCopied(false);
      return;
    }

    try {
      const lastSubmit = sessionStorage.getItem(cooldownKey);
      if (lastSubmit) {
        const elapsed = (Date.now() - Number(lastSubmit)) / 1000;
        if (elapsed < COOLDOWN_SECONDS) {
          setIsCooldown(true);
          return;
        }
      }
    } catch {
      // Ignore storage access issues
    }
    setIsCooldown(false);
  }, [isOpen, cooldownKey]);

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  function recordSubmission(): void {
    try {
      sessionStorage.setItem(cooldownKey, String(Date.now()));
    } catch {
      // Ignore
    }
  }

  async function handleCopy(): Promise<void> {
    const reportText = composeFeedbackReportText(
      editionDate,
      story,
      selectedCategory,
      detail,
    );
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(reportText);
        setCopied(true);
        recordSubmission();
      }
    } catch {
      // Fallback
    }
  }

  function handleGitHubSubmit(): void {
    recordSubmission();
  }

  const issueUrl = reportIssueHref(
    editionDate,
    story,
    selectedCategory,
    detail,
  );

  return (
    <div
      className="feedback-dialog-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <div className="feedback-dialog-card">
        <h3 id={titleId} className="feedback-dialog-title">
          Report an issue with this story
        </h3>
        <p id={descId} className="feedback-dialog-subtitle">
          Help us keep today's edition accurate and verified.
        </p>

        {isCooldown ? (
          <div className="feedback-cooldown-notice" role="status">
            <p>
              You recently submitted feedback for this story. Please wait a
              moment before sending additional reports.
            </p>
            <div className="feedback-dialog-actions">
              <button
                type="button"
                className="feedback-button-secondary"
                onClick={onClose}
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
            }}
          >
            <fieldset className="feedback-fieldset">
              <legend className="feedback-legend">Category</legend>
              <div className="feedback-categories">
                {FEEDBACK_CATEGORIES.map((category) => (
                  <label key={category} className="feedback-radio-label">
                    <input
                      type="radio"
                      name="feedback-category"
                      value={category}
                      checked={selectedCategory === category}
                      onChange={() => setSelectedCategory(category)}
                    />
                    <span>{category}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="feedback-field">
              <label htmlFor="feedback-detail" className="feedback-label">
                Details (optional)
              </label>
              <textarea
                id="feedback-detail"
                className="feedback-textarea"
                rows={3}
                maxLength={MAX_DETAIL_LENGTH}
                placeholder="Quote the wording or describe the issue..."
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
              />
              <span className="feedback-char-count">
                {detail.length}/{MAX_DETAIL_LENGTH}
              </span>
            </div>

            {copied ? (
              <p className="feedback-success-msg" role="status">
                ✅ Report text copied to clipboard. You can paste it into an
                issue, message, or email.
              </p>
            ) : null}

            <div className="feedback-dialog-actions">
              <a
                href={issueUrl}
                rel="noopener"
                target="_blank"
                className="feedback-button-primary"
                onClick={handleGitHubSubmit}
              >
                Open GitHub Issue
              </a>

              <button
                type="button"
                className="feedback-button-secondary"
                onClick={handleCopy}
              >
                {copied ? "Copied" : "Copy report text"}
              </button>

              <button
                type="button"
                className="feedback-button-cancel"
                onClick={onClose}
              >
                Cancel
              </button>
            </div>

            <p className="feedback-privacy-note">
              No account or personal data is collected on this device.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
