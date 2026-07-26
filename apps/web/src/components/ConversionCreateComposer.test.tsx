import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConversionCreateComposer } from "./ConversionCreateComposer";

afterEach(() => vi.unstubAllGlobals());

describe("Conversion Create visible option surfaces", () => {
  it("renders three independent task-first selectors and blocks submit until each resolves", () => {
    vi.stubGlobal("React", React);
    const html = renderToStaticMarkup(
      <ConversionCreateComposer
        action={async () => undefined}
        returnPage={2}
        returnQuery="rice"
      />,
    );

    for (const name of ["itemId", "fromUomId", "toUomId"]) {
      expect(html).toContain(`name="${name}"`);
    }
    for (const label of ["Search item", "Search from UOM", "Search to UOM"]) {
      expect(html).toContain(label);
    }
    expect(html.match(/aria-busy="true"/g)).toHaveLength(3);
    expect(html.match(/min-h-11/g)?.length).toBeGreaterThanOrEqual(10);
    expect(html).toContain("Create Conversion</button>");
    expect(html).toContain("disabled");
    expect(html).toContain('name="returnConversionQuery"');
    expect(html).toContain('value="rice"');
  });
});
