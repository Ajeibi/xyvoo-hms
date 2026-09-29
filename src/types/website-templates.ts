export type WebsiteTemplatePage = {
  /** Shown in the previewer's page picker. */
  label: string;
  /** File inside the template's preview folder, e.g. "product.html". */
  file: string;
};

export type WebsiteTemplate = {
  slug: string;
  /** "storefront" templates sell products (XYVOO Storefront); "hotel" templates take booking requests (XYVOO HMS). */
  kind: "storefront" | "hotel";
  name: string;
  /** Kind of business the template is designed around. */
  industry: string;
  summary: string;
  description: string;
  /** Public folder the static preview is built into, e.g. "/template-previews/linden-home". */
  previewPath: string;
  pageCount: number;
  /** Pages offered in the previewer, in picker order. The first is the default. */
  pages: WebsiteTemplatePage[];
  highlights: string[];
  /** Brand swatches shown on the gallery card. */
  palette: string[];
};
