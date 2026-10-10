// Kept free of catalog.json imports so client components can use it cheaply.

/** The MIT notice of the rigged character library; it must travel with every copy of those files. */
export const COPYRIGHT_LINE = "Copyright (c) 2020 Microsoft";

/** The original author of a model whose license requires credit (CC BY). */
export interface Credit {
  /** The model's original title. */
  title: string;
  author: string;
  authorUrl: string;
  /** Where the original is published. */
  url: string;
}

/** “Title” by Author (author URL), source URL — the credit CC BY asks for. */
export function creditLine(c: Credit): string {
  return `“${c.title}” by ${c.author} (${c.authorUrl}), ${c.url}`;
}

/** Contents of the ATTRIBUTION.txt bundled with every .zip. */
export function packAttributionFile({
  name,
  items,
  notice,
  site,
}: {
  name: string;
  /** `credit`: the creditLine() of models that require one. */
  items: { title: string; id: string; credit?: string }[];
  /** One line per license: "License: <license>. <terms>." */
  notice: string[];
  site?: string;
}): string {
  return [
    name,
    "",
    `Contains ${items.length} file${items.length === 1 ? "" : "s"}.`,
    ...notice,
    "",
    "Included:",
    ...items.map((i) => `- ${i.title} (${i.id})${i.credit ? ` — ${i.credit}` : ""}`),
    "",
    "Keep the license file(s) and this notice with the models when you redistribute them.",
    ...(site ? ["", `Downloaded from ${site}`] : []),
    "",
  ].join("\n");
}
