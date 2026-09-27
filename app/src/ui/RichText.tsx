/**
 * Sandboxed rich content (lib/richtext.ts model): links are intercepted and
 * shown with their real destination domain first; linked media is loaded only
 * when the user allows remote media and is hash-verified when an attachment
 * pins its bytes (spec/feeds.md §1.1/§1.4). Inline data URLs are covered by
 * the item hash.
 */
import { useMemo, type ReactNode } from 'react';
import { Text, View, type TextStyle } from 'react-native';
import { domainOf } from '../lib/format';
import { useVerifiedImage } from './useVerifiedImage';
import { parseRichHtml, type Block, type Mark, type Span } from '../lib/richtext';
import type { FeedItem } from '../lib/item';
import { Button, Sheet, Stack, Txt, VerifiedImage } from './kit';
import { mono, useColors, type Colors } from './theme';

interface Context {
  origin: string;
  item: FeedItem;
  loadRemoteMedia: boolean;
  onLinkTap: (url: string) => void;
  colors: Colors;
}

export function RichText({
  html,
  origin,
  item,
  loadRemoteMedia = true,
  onLinkTap,
}: {
  html: string;
  origin: string;
  item: FeedItem;
  /** honor the remote-media privacy preference (spec/feeds.md §1.4) */
  loadRemoteMedia?: boolean;
  onLinkTap: (url: string) => void;
}) {
  const colors = useColors();
  const blocks = useMemo(() => parseRichHtml(html), [html]);
  const ctx: Context = { origin, item, loadRemoteMedia, onLinkTap, colors };
  return <Stack gap={14}>{blocks.map((b, i) => renderBlock(b, i, ctx))}</Stack>;
}

const BODY: TextStyle = { fontSize: 17, lineHeight: 27 };
const HEADING_SIZE = { 1: 26, 2: 22, 3: 19, 4: 17 } as const;

function markStyle(mark: Mark, colors: Colors): TextStyle {
  switch (mark) {
    case 'bold':
      return { fontWeight: '700' };
    case 'italic':
      return { fontStyle: 'italic' };
    case 'underline':
      return { textDecorationLine: 'underline' };
    case 'strike':
      return { textDecorationLine: 'line-through' };
    case 'code':
      return { fontFamily: mono, backgroundColor: colors.surface2 };
    case 'small':
    case 'sub':
    case 'sup':
      return { fontSize: 13 };
  }
}

function spans(list: Span[], ctx: Context): ReactNode[] {
  return list.map((span, i) => (
    <Text
      key={i}
      style={[
        ...span.marks.map((m) => markStyle(m, ctx.colors)),
        span.href ? { color: ctx.colors.accent } : null,
      ]}
      accessibilityRole={span.href ? 'link' : undefined}
      accessibilityHint={span.href ? `Opens ${domainOf(span.href)}` : undefined}
      onPress={span.href ? () => ctx.onLinkTap(span.href!) : undefined}
    >
      {span.text}
    </Text>
  ));
}

function renderBlocks(blocks: Block[], ctx: Context): ReactNode {
  return <Stack gap={10}>{blocks.map((b, i) => renderBlock(b, i, ctx))}</Stack>;
}

function renderBlock(block: Block, key: number, ctx: Context): ReactNode {
  const { colors } = ctx;
  switch (block.t) {
    case 'para':
      return (
        <Text key={key} style={[BODY, { color: colors.text }]}>
          {spans(block.spans, ctx)}
        </Text>
      );
    case 'heading':
      return (
        <Text
          key={key}
          accessibilityRole="header"
          style={{ fontSize: HEADING_SIZE[block.level], lineHeight: HEADING_SIZE[block.level] * 1.3, fontWeight: '700', color: colors.text }}
        >
          {spans(block.spans, ctx)}
        </Text>
      );
    case 'image':
      return <ContentImage key={key} src={block.src} alt={block.alt} ctx={ctx} />;
    case 'list':
      return (
        <Stack key={key} gap={6}>
          {block.items.map((item, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
              <Text style={[BODY, { color: colors.text2, minWidth: 18 }]}>{block.ordered ? `${i + 1}.` : '•'}</Text>
              <View style={{ flex: 1 }}>{renderBlocks(item, ctx)}</View>
            </View>
          ))}
        </Stack>
      );
    case 'quote':
      return (
        <View key={key} style={{ borderLeftWidth: 3, borderLeftColor: colors.border, paddingLeft: 12 }}>
          {renderBlocks(block.blocks, ctx)}
        </View>
      );
    case 'pre':
      return (
        <Text
          key={key}
          style={{ fontFamily: mono, fontSize: 14, lineHeight: 20, color: colors.text, backgroundColor: colors.surface2, padding: 12, borderRadius: 8 }}
        >
          {block.text}
        </Text>
      );
    case 'rule':
      return <View key={key} style={{ height: 1, backgroundColor: colors.border }} />;
    case 'table':
      return (
        <View key={key} style={{ borderWidth: 1, borderColor: colors.border }}>
          {block.rows.map((row, r) => (
            <View key={r} style={{ flexDirection: 'row' }}>
              {row.cells.map((cell, cIdx) => (
                <View key={cIdx} style={{ flex: 1, padding: 8, borderWidth: 0.5, borderColor: colors.border }}>
                  {row.header ? (
                    <Text style={{ fontWeight: '700', color: colors.text }}>
                      {cell.flatMap((b) => (b.t === 'para' ? spans(b.spans, ctx) : []))}
                    </Text>
                  ) : (
                    renderBlocks(cell, ctx)
                  )}
                </View>
              ))}
            </View>
          ))}
        </View>
      );
  }
}

function ContentImage({ src, alt, ctx }: { src: string; alt: string; ctx: Context }) {
  const { origin, item, loadRemoteMedia } = ctx;
  const want = item.attachments?.find((a) => a.url === src)?.sha256;
  const uri = useVerifiedImage(src, origin, want, src.startsWith('data:') || loadRemoteMedia);

  if (!uri) return null;
  return <VerifiedImage uri={uri} label={alt} style={{ borderRadius: 12, overflow: 'hidden' }} />;
}

/** Open a link after showing its real destination (no auto-open). */
export function LinkConfirm({ url, onConfirm, onCancel }: { url: string; onConfirm: () => void; onCancel: () => void }) {
  const domain = domainOf(url);
  return (
    <Sheet onClose={onCancel}>
      <Txt variant="section" style={{ marginBottom: 4 }}>
        Open external link?
      </Txt>
      <Txt variant="small">
        This link goes to <Txt variant="mono">{domain}</Txt>. It is not part of the company's signed message.
      </Txt>
      <Stack style={{ marginTop: 12 }}>
        <Button label={`Open ${domain}`} onPress={onConfirm} />
        <Button kind="secondary" label="Cancel" onPress={onCancel} />
      </Stack>
    </Sheet>
  );
}
