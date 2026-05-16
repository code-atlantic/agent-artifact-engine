import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import type { Schema } from "hast-util-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { escapeHtml } from "./html.js";

interface AnyNode {
  type: string;
  value?: string;
  name?: string;
  url?: string;
  title?: string;
  alt?: string;
  attributes?: MdxAttribute[];
  children?: AnyNode[];
  [key: string]: unknown;
}

interface MdxAttribute {
  type: string;
  name?: string;
  value?: string | null | { type: string; value?: string };
}

const sanitizeSchema: Schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    h1: [...(defaultSchema.attributes?.h1 ?? []), "id"],
    h2: [...(defaultSchema.attributes?.h2 ?? []), "id"],
    h3: [...(defaultSchema.attributes?.h3 ?? []), "id"],
    h4: [...(defaultSchema.attributes?.h4 ?? []), "id"],
    h5: [...(defaultSchema.attributes?.h5 ?? []), "id"],
    h6: [...(defaultSchema.attributes?.h6 ?? []), "id"],
    code: [...(defaultSchema.attributes?.code ?? []), ["className", /^language-[\w-]+$/]]
  }
};

export async function renderMdxToHtml(source: string, title: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMdx)
    .use(safeMdxSubset)
    .use(remarkRehype)
    .use(rehypeSlug)
    .use(rehypeSanitize, sanitizeSchema)
    .use(rehypeStringify)
    .process(source);

  return renderMdxDocument(title, String(file));
}

function safeMdxSubset() {
  return (tree: AnyNode) => {
    transformChildren(tree);
  };
}

function transformChildren(parent: AnyNode): void {
  if (!Array.isArray(parent.children)) return;

  const nextChildren: AnyNode[] = [];

  for (const child of parent.children) {
    if (isMdxJsx(child)) {
      transformChildren(child);
      nextChildren.push(...convertMdxJsx(child));
      continue;
    }

    if (isExecutableMdx(child)) continue;

    transformChildren(child);
    nextChildren.push(child);
  }

  parent.children = nextChildren;
}

function convertMdxJsx(node: AnyNode): AnyNode[] {
  const name = node.name ?? "";
  const attrs = attributesToRecord(node.attributes);
  const children = node.children ?? [];
  const isTextElement = node.type === "mdxJsxTextElement";

  if (name === "Callout" || name === "Note" || name === "Warning") {
    const label = attrs.type ?? name;
    if (isTextElement) {
      return [{ type: "strong", children: [{ type: "text", value: `${label}: ` }] }, ...children];
    }

    return [
      {
        type: "blockquote",
        children: [
          {
            type: "paragraph",
            children: [{ type: "strong", children: [{ type: "text", value: `${label}:` }] }]
          },
          ...children
        ]
      }
    ];
  }

  if (name === "img" || name === "Image") {
    const src = attrs.src;
    if (!src || !isSafeMediaUrl(src)) return [];

    return [{ type: "image", url: src, alt: attrs.alt ?? "", title: attrs.title }];
  }

  if (name === "a" || name === "Link") {
    const href = attrs.href;
    if (!href || !isSafeLinkUrl(href)) return children;

    return [
      {
        type: "link",
        url: href,
        title: attrs.title,
        children: children.length ? children : [{ type: "text", value: href }]
      }
    ];
  }

  return children.length ? children : [];
}

function attributesToRecord(attributes: MdxAttribute[] | undefined): Record<string, string> {
  const record: Record<string, string> = {};
  if (!attributes) return record;

  for (const attribute of attributes) {
    if (attribute.type !== "mdxJsxAttribute" || !attribute.name) continue;
    if (typeof attribute.value === "string") record[attribute.name] = attribute.value;
  }

  return record;
}

function isMdxJsx(node: AnyNode): boolean {
  return node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement";
}

function isExecutableMdx(node: AnyNode): boolean {
  return node.type === "mdxjsEsm" || node.type === "mdxFlowExpression" || node.type === "mdxTextExpression";
}

function isSafeMediaUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) || /^data:image\//i.test(value);
}

function isSafeLinkUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) || /^mailto:/i.test(value) || value.startsWith("#");
}

function renderMdxDocument(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light;
      --text: #1c2430;
      --muted: #607086;
      --line: #d9e2ee;
      --code-bg: #f1f5f9;
      --accent: #155dfc;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #fff;
      color: var(--text);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.65;
    }
    main {
      width: min(820px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 48px 0 72px;
    }
    h1, h2, h3, h4 {
      margin: 1.5em 0 0.45em;
      line-height: 1.12;
      letter-spacing: 0;
    }
    h1 {
      margin-top: 0;
      font-size: clamp(2.2rem, 6vw, 4rem);
    }
    h2 { font-size: 1.75rem; }
    h3 { font-size: 1.25rem; }
    p, ul, ol, blockquote, table, pre { margin: 1em 0; }
    a {
      color: var(--accent);
      text-decoration-thickness: 0.08em;
      text-underline-offset: 0.16em;
    }
    img {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      border: 1px solid var(--line);
    }
    blockquote {
      border-left: 4px solid var(--accent);
      margin-left: 0;
      padding: 0.2rem 0 0.2rem 1rem;
      color: var(--muted);
    }
    code {
      border-radius: 5px;
      background: var(--code-bg);
      padding: 0.16rem 0.3rem;
      font-size: 0.92em;
    }
    pre {
      overflow-x: auto;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--code-bg);
      padding: 1rem;
    }
    pre code {
      background: transparent;
      padding: 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      display: block;
      overflow-x: auto;
    }
    th, td {
      border: 1px solid var(--line);
      padding: 0.55rem 0.7rem;
      text-align: left;
    }
    th { background: #f8fafc; }
  </style>
</head>
<body>
  <main>
${body}
  </main>
</body>
</html>`;
}
