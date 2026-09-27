import { describe, expect, it } from 'vitest';
import { parseRichHtml } from './richtext';

describe('rich content model', () => {
  it('keeps paragraphs, marks and http(s) links', () => {
    expect(parseRichHtml('<p>Hello <strong>big</strong> <a href="https://x.example/a">world</a></p>')).toEqual([
      {
        t: 'para',
        spans: [
          { text: 'Hello ', marks: [], href: undefined },
          { text: 'big', marks: ['bold'], href: undefined },
          { text: ' ', marks: [], href: undefined },
          { text: 'world', marks: [], href: 'https://x.example/a' },
        ],
      },
    ]);
  });

  it('drops forbidden elements with their content and non-http links', () => {
    const blocks = parseRichHtml(
      '<p>ok<script>alert(1)</script><style>p{}</style><a href="javascript:alert(1)">x</a></p><form><input value="seed"></form><iframe src="https://e"></iframe>',
    );
    expect(blocks).toEqual([{ t: 'para', spans: [{ text: 'okx', marks: [], href: undefined }] }]);
  });

  it('models images, lists, quotes, headings, rules and tables', () => {
    const blocks = parseRichHtml(
      '<h2>Title</h2><img src="https://e/i.png" alt="pic"><ul><li>a</li><li><p>b</p></li></ul><blockquote>q</blockquote><hr><table><tr><th>h</th></tr><tr><td>c</td></tr></table>',
    );
    expect(blocks.map((b) => b.t)).toEqual(['heading', 'image', 'list', 'quote', 'rule', 'table']);
    expect(blocks[1]).toEqual({ t: 'image', src: 'https://e/i.png', alt: 'pic' });
    const list = blocks[2] as Extract<(typeof blocks)[number], { t: 'list' }>;
    expect(list.items).toHaveLength(2);
    const table = blocks[5] as Extract<(typeof blocks)[number], { t: 'table' }>;
    expect(table.rows.map((r) => r.header)).toEqual([true, false]);
  });

  it('collapses whitespace and decodes entities', () => {
    expect(parseRichHtml('<p>  a \n  b&amp;c  </p>')).toEqual([
      { t: 'para', spans: [{ text: 'a b&c', marks: [], href: undefined }] },
    ]);
  });
});
