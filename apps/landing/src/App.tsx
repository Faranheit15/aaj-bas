import type { JSX } from "react";
import { BrandMark } from "@aaj-bas/ui";

const readerUrl = import.meta.env.VITE_APP_URL ?? "/";

export function App(): JSX.Element {
  return (
    <main className="landing-page">
      <header className="landing-hero">
        <p className="brand-line">
          <BrandMark />
        </p>
        <h1>
          Know what happened.
          <br />
          Then get on with your day.
        </h1>
        <p className="intro">
          10 important stories. Context, not clickbait. A clear end.
        </p>
        <a className="primary-link" href={readerUrl}>
          Read today&apos;s edition
        </a>
        <ul className="principles" aria-label="What Aaj, Bas. avoids">
          <li>No infinite feed.</li>
          <li>No breaking-news anxiety.</li>
          <li>No recommendation algorithm.</li>
        </ul>
      </header>

      <section className="how-it-works" aria-labelledby="how-it-works-heading">
        <h2 id="how-it-works-heading">How it works</h2>
        <ol>
          <li>We find the stories that actually matter.</li>
          <li>We combine duplicate coverage into one story.</li>
          <li>We explain what changed and why it matters.</li>
          <li>After 10 stories, you&apos;re done.</li>
        </ol>
      </section>

      <p className="audience-note">
        Built for people who deleted social media and then realized that&apos;s
        where they got their news.
      </p>
    </main>
  );
}
