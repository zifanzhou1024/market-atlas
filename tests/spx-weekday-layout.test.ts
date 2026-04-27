import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const css = readFileSync("app/globals.css", "utf8");

describe("SPX weekday layout", () => {
  test("keeps the headline metric in a right rail until mobile widths", () => {
    expect(css).toContain(".workbenchIntro {\n  display: grid;\n  grid-template-columns: minmax(0, 1fr) 260px;");
    expect(css).not.toMatch(
      /@media \(max-width: 920px\) \{[\s\S]*\.workbenchIntro,[\s\S]*grid-template-columns: 1fr/
    );
    expect(css).toMatch(
      /@media \(max-width: 720px\) \{[\s\S]*\.workbenchIntro[\s\S]*grid-template-columns: 1fr/
    );
  });

  test("allocates more space to the weekday summary chart", () => {
    expect(css).toContain(
      ".weekdayChartGrid {\n  display: grid;\n  grid-template-columns: minmax(420px, 1fr) minmax(0, 1.08fr);"
    );
  });
});
