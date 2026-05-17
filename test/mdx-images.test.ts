import { renderMdxToHtml } from "../src/render/mdx.js";

describe("MDX image rendering", () => {
  it("keeps safe data image sources", async () => {
    const html = await renderMdxToHtml(
      "![tiny red dot](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ)",
      "Image Test"
    );

    expect(html).toContain('src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ"');
    expect(html).toContain('alt="tiny red dot"');
  });
});
