import type { JSX } from "react";
import { BrandMark } from "@aaj-bas/ui";

export function App(): JSX.Element {
  return (
    <main className="reader-shell">
      <header>
        <p className="brand-line">
          <BrandMark />
        </p>
      </header>
      <section aria-labelledby="edition-heading">
        <h1 id="edition-heading">Today&apos;s edition</h1>
        <p>The daily edition will appear here.</p>
      </section>
    </main>
  );
}
