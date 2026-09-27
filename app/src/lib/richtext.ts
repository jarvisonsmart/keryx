/**
 * Signed `content_html` → a small render model (ui/RichText.tsx). Sanitized by
 * construction: only the allowlisted tags below become output, forbidden
 * elements are dropped with their content, and the only attributes read are
 * `href` (http/https links) and `src`/`alt` (images). No scripts, forms,
 * frames or embeds can exist in the model — the "channel never asks for a
 * password, seed, or code" promise is structural.
 */
import { parseDocument } from 'htmlparser2';
import { isTag, isText, type ChildNode, type Element } from 'domhandler';

export type Mark = 'bold' | 'italic' | 'underline' | 'strike' | 'code' | 'small' | 'sub' | 'sup';

export interface Span {
  text: string;
  marks: Mark[];
  /** an http(s) link target */
  href?: string;
}

export type Block =
  | { t: 'para'; spans: Span[] }
  | { t: 'heading'; level: 1 | 2 | 3 | 4; spans: Span[] }
  | { t: 'image'; src: string; alt: string }
  | { t: 'list'; ordered: boolean; items: Block[][] }
  | { t: 'quote'; blocks: Block[] }
  | { t: 'pre'; text: string }
  | { t: 'rule' }
  | { t: 'table'; rows: { header: boolean; cells: Block[][] }[] };

const DROPPED = new Set([
  'script', 'style', 'iframe', 'form', 'input', 'button', 'object', 'embed', 'link', 'meta',
  'svg', 'math', 'textarea', 'select', 'template', 'noscript', 'head', 'title',
]);

const MARKS: Record<string, Mark> = {
  strong: 'bold', b: 'bold', em: 'italic', i: 'italic', u: 'underline', s: 'strike',
  code: 'code', small: 'small', sub: 'sub', sup: 'sup',
};

const HEADINGS: Record<string, 1 | 2 | 3 | 4> = { h1: 1, h2: 2, h3: 3, h4: 4 };

/** Tags that only group blocks; unknown tags are unwrapped the same way. */
const CONTAINERS = new Set(['div', 'figure', 'figcaption', 'section', 'article', 'body', 'html']);

function linkTarget(href: string | undefined): string | undefined {
  return href && /^https?:\/\//i.test(href.trim()) ? href.trim() : undefined;
}

class BlockBuilder {
  readonly blocks: Block[] = [];
  private spans: Span[] = [];

  text(text: string, marks: Mark[], href?: string): void {
    const collapsed = text.replace(/\s+/g, ' ');
    if (!collapsed) return;
    const last = this.spans.at(-1);
    if (last && last.href === href && last.marks.join() === marks.join()) last.text += collapsed;
    else this.spans.push({ text: collapsed, marks, href });
  }

  lineBreak(): void {
    this.spans.push({ text: '\n', marks: [] });
  }

  /** Close the current paragraph, dropping whitespace-only runs. */
  flush(): void {
    const spans = this.spans;
    this.spans = [];
    if (spans.length === 0) return;
    spans[0].text = spans[0].text.replace(/^ +/, '');
    const last = spans[spans.length - 1];
    last.text = last.text.replace(/ +$/, '');
    const kept = spans.filter((s) => s.text !== '');
    if (kept.some((s) => s.text.trim() !== '')) this.blocks.push({ t: 'para', spans: kept });
  }

  block(block: Block): void {
    this.flush();
    this.blocks.push(block);
  }

  takeSpans(): Span[] {
    const before = this.blocks.length;
    this.flush();
    const para = this.blocks.length > before ? this.blocks.pop() : undefined;
    return para?.t === 'para' ? para.spans : [];
  }
}

function textOf(node: ChildNode): string {
  if (isText(node)) return node.data;
  if (isTag(node) && !DROPPED.has(node.name)) return node.children.map(textOf).join('');
  return '';
}

function walk(nodes: ChildNode[], out: BlockBuilder, marks: Mark[], href?: string): void {
  for (const node of nodes) {
    if (isText(node)) {
      out.text(node.data, marks, href);
      continue;
    }
    if (!isTag(node) || DROPPED.has(node.name)) continue;
    element(node, out, marks, href);
  }
}

function blocksOf(nodes: ChildNode[]): Block[] {
  const out = new BlockBuilder();
  walk(nodes, out, []);
  out.flush();
  return out.blocks;
}

function element(el: Element, out: BlockBuilder, marks: Mark[], href?: string): void {
  const name = el.name;
  const mark = MARKS[name];
  if (mark) return walk(el.children, out, marks.includes(mark) ? marks : [...marks, mark], href);
  if (name === 'a') return walk(el.children, out, marks, linkTarget(el.attribs.href) ?? href);
  if (name === 'span') return walk(el.children, out, marks, href);
  if (name === 'br') return out.lineBreak();
  if (name === 'img') {
    const src = el.attribs.src?.trim();
    if (src) out.block({ t: 'image', src, alt: el.attribs.alt ?? '' });
    return;
  }
  if (name === 'hr') return out.block({ t: 'rule' });
  if (name === 'pre') return out.block({ t: 'pre', text: el.children.map(textOf).join('').replace(/^\n/, '') });
  const level = HEADINGS[name];
  if (level) {
    out.flush();
    const inner = new BlockBuilder();
    walk(el.children, inner, marks, href);
    const spans = inner.takeSpans();
    if (spans.length > 0) out.block({ t: 'heading', level, spans });
    return;
  }
  if (name === 'ul' || name === 'ol') {
    const items = el.children
      .filter((c): c is Element => isTag(c) && c.name === 'li')
      .map((li) => blocksOf(li.children));
    return out.block({ t: 'list', ordered: name === 'ol', items });
  }
  if (name === 'blockquote') return out.block({ t: 'quote', blocks: blocksOf(el.children) });
  if (name === 'table') return out.block({ t: 'table', rows: tableRows(el) });
  if (name === 'p' || CONTAINERS.has(name) || name === 'li') {
    out.flush();
    walk(el.children, out, marks, href);
    out.flush();
    return;
  }
  // unknown but harmless tags are unwrapped: their text stays, the tag goes
  walk(el.children, out, marks, href);
}

function tableRows(table: Element): { header: boolean; cells: Block[][] }[] {
  const rows: { header: boolean; cells: Block[][] }[] = [];
  const visit = (el: Element) => {
    for (const child of el.children) {
      if (!isTag(child)) continue;
      if (child.name === 'tr') {
        const cells = child.children.filter((c): c is Element => isTag(c) && (c.name === 'td' || c.name === 'th'));
        rows.push({ header: cells.every((c) => c.name === 'th'), cells: cells.map((c) => blocksOf(c.children)) });
      } else if (child.name === 'thead' || child.name === 'tbody') {
        visit(child);
      }
    }
  };
  visit(table);
  return rows;
}

export function parseRichHtml(html: string): Block[] {
  return blocksOf(parseDocument(html, { decodeEntities: true }).children);
}
