/**
 * Company detail: branded sticky header (logo + name + origin), one-way
 * feed of FULL articles (big square picture, title, date/tags, content —
 * no separate detail view), channel toggles + filter sheet, suspension and
 * rebranding states per spec/core.md §2, §4.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert as NativeAlert, FlatList, Pressable, View, type ViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowClockwise, ArrowLeft, GearSix, LockSimple, Plus, ShieldWarning, Trash } from './icons';
import type { ChannelState, CompanyRecord, StoredItem } from '../lib/store';
import { formatDate, formatDateTime, matchesFilter } from '../lib/format';
import { useVerifiedImage } from './useVerifiedImage';
import type { FeedItem } from '../lib/item';
import { openAttachment } from '../lib/attachment';
import { appPlatform } from '../lib/platform';
import { CompanyLogo } from './CompanyLogo';
import { LinkConfirm, RichText } from './RichText';
import { NotificationBanner } from './NotificationBanner';
import { BuildStamp } from './BuildStamp';
import { Alert, AppBar, Button, Chip, Divider, IconButton, Row, Screen, Sheet, Stack, Toggle, Txt, VerifiedImage } from './kit';
import { MAX_WIDTH, mono, radius, useColors } from './theme';
import { useApp } from '../state';

/** Ask before a destructive action (the web has no native alert). */
function confirmRemove(origin: string, onConfirm: () => void) {
  const message = `Remove ${origin}? All saved messages are deleted from this device.`;
  if (appPlatform() === 'web') {
    if (window.confirm(message)) onConfirm();
    return;
  }
  NativeAlert.alert('Remove company', message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: onConfirm },
  ]);
}

function feedKeyOf(stored: StoredItem): string {
  return stored.isPrivate ? `private:${stored.feedUrl}` : `public:${stored.channel}`;
}

export function CompanyView({
  company,
  items,
  onBack,
  onRepair,
  onAdd,
}: {
  company: CompanyRecord;
  items: StoredItem[];
  onBack: () => void;
  /** re-pair flow for a company_name change (scan a fresh QR) */
  onRepair: (origin: string) => void;
  /** add another company (single-source shortcut: no contacts list yet) */
  onAdd: () => void;
}) {
  const { actions, companies, syncing, notification, freshTest } = useApp();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [showSettings, setShowSettings] = useState(false);
  const [pendingLink, setPendingLink] = useState<{ url: string; item: FeedItem } | null>(null);

  const followed = useMemo(
    () => new Set(company.channels.filter((ch) => ch.followed).map((ch) => ch.name)),
    [company.channels],
  );
  const visible = useMemo(
    () =>
      items
        .filter((i) => i.isPrivate || (followed.has(i.channel) && matchesFilter(i.item, company.prefs)))
        .sort((a, b) => {
          const ta = Date.parse(a.published);
          const tb = Date.parse(b.published);
          if (!Number.isNaN(ta) && !Number.isNaN(tb)) return tb - ta;
          if (!Number.isNaN(ta)) return -1;
          if (!Number.isNaN(tb)) return 1;
          return (b.feedIndex ?? 0) - (a.feedIndex ?? 0);
        }),
    [items, followed, company.prefs],
  );

  // mark an article read once 60% of it has been on screen (no detail view)
  const markRead = useRef(actions.markRead);
  markRead.current = actions.markRead;
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<StoredItem>[] }) => {
      for (const { item: stored, isViewable } of viewableItems) {
        if (!isViewable || stored.read) continue;
        void markRead.current(stored.origin, feedKeyOf(stored), stored.item.id!, true);
      }
    },
    [],
  );
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  const remove = () => confirmRemove(company.origin, () => void actions.removeCompany(company.origin));

  // --- suspension (spec/core.md §4): warning + Remove only, no re-pair ----
  if (company.status === 'suspended') {
    return (
      <Screen>
        <Alert danger>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 4 }}>
            <ShieldWarning size={22} color={c.text} />
            <Txt bold style={{ fontSize: 17 }}>Messages are not shown</Txt>
          </View>
          <Txt variant="small" style={{ fontSize: 14 }}>
            This company's identity changed. This can mean the company's website or signing keys were compromised.
          </Txt>
          <Txt variant="mono" muted style={{ fontSize: 12, marginTop: 8 }}>{company.origin}</Txt>
        </Alert>
        <Stack style={{ marginTop: 16 }}>
          <Button kind="danger" label="Remove company" icon={<Trash size={20} color={c.danger} />} onPress={() => void actions.removeCompany(company.origin)} />
          <Button kind="ghost" label="Back" onPress={onBack} />
        </Stack>
      </Screen>
    );
  }

  // --- rebranding (spec/core.md §2): company_name changed → re-pair required
  if (company.status === 'rebrand' || company.rebrandPending) {
    return (
      <Screen>
        <Alert danger title="This company changed its name">
          <Txt variant="small" style={{ fontSize: 14 }}>
            A company's name can only change after you confirm it again. Scan a fresh QR code from the company to
            continue receiving its messages.
          </Txt>
          <Txt variant="mono" muted style={{ fontSize: 12, marginTop: 8 }}>{company.origin}</Txt>
        </Alert>
        <Stack style={{ marginTop: 16 }}>
          <Button label="Scan a new QR code" onPress={() => onRepair(company.origin)} />
          <Button kind="danger" label="Remove company" icon={<Trash size={20} color={c.danger} />} onPress={() => void actions.removeCompany(company.origin)} />
          {companies.length > 1 && <Button kind="ghost" label="Back" onPress={onBack} />}
        </Stack>
      </Screen>
    );
  }

  const custom = company.targets.signed.custom;
  const anyFollowed = followed.size > 0;

  const header = (
    <View style={{ paddingHorizontal: 20 }}>
      <View style={{ paddingTop: 8 }}>
        <NotificationBanner
          state={notification}
          freshTest={freshTest}
          onEnable={() => void actions.enableNotifications()}
          onCheck={() => void actions.checkNotifications()}
          onRetry={() => void actions.runNotificationSelfTest()}
        />
      </View>
      {company.logoChangePending ? (
        <View style={{ paddingTop: 12 }}>
          <Alert>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <Txt style={{ flex: 1, fontSize: 14 }}>The company updated its logo.</Txt>
              <Button compact kind="secondary" label="Got it" onPress={() => void actions.acknowledgeLogo(company.origin)} />
            </View>
          </Alert>
        </View>
      ) : null}
      {company.lastSyncErrors && company.lastSyncErrors.length > 0 ? (
        <Txt variant="small" style={{ paddingTop: 12 }}>{company.lastSyncErrors[0]}</Txt>
      ) : null}
    </View>
  );

  const empty = (
    <View style={{ alignItems: 'center', padding: 40, gap: 8 }}>
      <Txt variant="section">{anyFollowed ? 'No messages yet' : 'No channels yet'}</Txt>
      <Txt variant="small" style={{ textAlign: 'center', maxWidth: 280 }}>
        {anyFollowed
          ? 'Messages appear here as soon as the company publishes.'
          : 'Open settings to follow a channel from this company.'}
      </Txt>
    </View>
  );

  const footer =
    visible.length > 0 ? (
      <View style={{ marginHorizontal: 20, marginTop: 24, marginBottom: 32, paddingTop: 16, borderTopWidth: 1, borderTopColor: c.border, flexDirection: 'row', gap: 8 }}>
        <View style={{ marginTop: 2 }}>
          <LockSimple size={16} color={c.text2} />
        </View>
        <Txt variant="small" style={{ flex: 1 }}>This channel will never ask you for a password, seed, or code.</Txt>
      </View>
    ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <AppBar>
        {companies.length > 1 ? (
          <IconButton label="Back" onPress={onBack}>
            <ArrowLeft size={24} color={c.text} />
          </IconButton>
        ) : null}
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <CompanyLogo url={custom?.logo} origin={company.origin} expectedSha={custom?.logo_sha256} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt bold numberOfLines={1} style={{ fontSize: 17, lineHeight: 20 }}>
              {custom?.company_name ?? company.origin}
            </Txt>
            <Txt numberOfLines={1} style={{ fontFamily: mono, fontSize: 12, color: c.text2 }}>
              {company.origin}
            </Txt>
          </View>
        </View>
        <IconButton label="Refresh" onPress={() => void actions.syncCompanyNow(company.origin)}>
          {syncing ? <ActivityIndicator color={c.text} /> : <ArrowClockwise size={22} color={c.text} />}
        </IconButton>
        <IconButton label="Settings" onPress={() => setShowSettings(true)}>
          <GearSix size={24} color={c.text} />
        </IconButton>
        {companies.length === 1 ? (
          <IconButton label="Add company" onPress={onAdd}>
            <Plus size={24} color={c.text} />
          </IconButton>
        ) : null}
      </AppBar>

      <FlatList
        data={visible}
        keyExtractor={(s) => s.id}
        style={{ flex: 1 }}
        contentContainerStyle={{ width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', paddingBottom: insets.bottom }}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
        ItemSeparatorComponent={() => <Divider />}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        renderItem={({ item: stored }) => (
          <FeedArticle company={company} stored={stored} onLinkTap={(url) => setPendingLink({ url, item: stored.item })} />
        )}
      />

      {showSettings ? (
        <SettingsSheet company={company} items={items} onRemove={remove} onClose={() => setShowSettings(false)} />
      ) : null}

      {pendingLink ? (
        <LinkConfirm
          url={pendingLink.url}
          onConfirm={() => {
            void openAttachment(pendingLink.url, pendingLink.item);
            setPendingLink(null);
          }}
          onCancel={() => setPendingLink(null)}
        />
      ) : null}
    </View>
  );
}

/** One full article in the feed: big square picture, title, date/tags, content. */
function FeedArticle({
  company,
  stored,
  onLinkTap,
}: {
  company: CompanyRecord;
  stored: StoredItem;
  onLinkTap: (url: string) => void;
}) {
  const c = useColors();
  const [showTime, setShowTime] = useState(false);
  const item = stored.item;

  const img = useVerifiedImage(item.image, stored.origin, item.image_sha256,
    !!item.image?.startsWith('data:') || company.prefs.loadRemoteMedia);

  const published = item.date_published ?? '';
  const date = published ? formatDate(published) : '';

  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
      {img ? (
        <VerifiedImage uri={img} aspectRatio={1} style={{ borderRadius: radius.card, overflow: 'hidden', backgroundColor: c.surface2 }} />
      ) : null}
      <View style={{ paddingTop: 14 }}>
        <Txt accessibilityRole="header" style={{ fontSize: 24, lineHeight: 30, fontWeight: '700', marginBottom: 8 }}>
          {item.title ?? 'Untitled'}
        </Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 14 }}>
          {date ? (
            <Pressable
              accessibilityRole="button"
              accessibilityHint={showTime ? 'Hide the time' : 'Show the exact time'}
              onPress={() => setShowTime((v) => !v)}
            >
              <Txt variant="small" style={{ textDecorationLine: 'underline', textDecorationStyle: 'dotted' }}>
                {showTime ? formatDateTime(published) : date}
              </Txt>
            </Pressable>
          ) : null}
          {stored.updated ? <Chip label="Updated" accent /> : null}
          {(item.tags ?? []).slice(0, 4).map((tag) => (
            <Chip key={tag} label={tag} />
          ))}
        </View>
        <RichText
          html={item.content_html ?? ''}
          origin={company.origin}
          item={item}
          loadRemoteMedia={company.prefs.loadRemoteMedia}
          onLinkTap={onLinkTap}
        />
      </View>
    </View>
  );
}

function SettingsSheet({
  company,
  items,
  onRemove,
  onClose,
}: {
  company: CompanyRecord;
  items: StoredItem[];
  onRemove: () => void;
  onClose: () => void;
}) {
  const { actions } = useApp();
  const c = useColors();
  const [languages, setLanguages] = useState<string[]>(company.prefs.languages);
  const [tags, setTags] = useState<string[]>(company.prefs.tags);
  const companyItems = items.filter((i) => i.origin === company.origin);

  const allLanguages = useMemo(
    () => [...new Set(companyItems.map((i) => i.item.language).filter((l): l is string => !!l))].sort(),
    [companyItems],
  );
  const allTags = useMemo(() => [...new Set(companyItems.flatMap((i) => i.item.tags ?? []))].sort(), [companyItems]);

  function toggleLanguage(lang: string) {
    const next = languages.includes(lang) ? languages.filter((l) => l !== lang) : [...languages, lang];
    setLanguages(next);
    void actions.setPrefs(company.origin, { languages: next });
  }

  function toggleTag(tag: string) {
    const next = tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag];
    setTags(next);
    void actions.setPrefs(company.origin, { tags: next });
  }

  return (
    <Sheet onClose={onClose}>
      <Txt variant="section" style={{ marginBottom: 12 }}>
        Settings
      </Txt>

      <SheetLabel first>Channels</SheetLabel>
      {company.channels.map((ch) => (
        <ChannelToggle
          key={ch.name}
          channel={ch}
          onToggle={(followed) => void actions.toggleChannel(company.origin, ch.name, followed)}
        />
      ))}

      {company.privateFeeds.length > 0 ? (
        <>
          <SheetLabel>Orders</SheetLabel>
          {company.privateFeeds.map((f) => (
            <View key={f.url} style={{ paddingVertical: 8 }}>
              <Txt bold>{f.displayName ?? 'Delivery'}</Txt>
              <Txt variant="small">
                {f.closed ? 'Finished' : f.expires ? `Open until ${f.expires.slice(0, 10)}` : 'Open'}
              </Txt>
            </View>
          ))}
        </>
      ) : null}

      <SheetLabel>Language</SheetLabel>
      <ChipGroup options={allLanguages} selected={languages} onToggle={toggleLanguage} />

      <SheetLabel>Tags</SheetLabel>
      <ChipGroup options={allTags} selected={tags} onToggle={toggleTag} />

      <SheetLabel>Remote media</SheetLabel>
      <View style={{ flexDirection: 'row' }}>
        <Chip
          accent={company.prefs.loadRemoteMedia}
          label={company.prefs.loadRemoteMedia ? 'Load images from the web' : 'Images off (privacy)'}
          onPress={() => void actions.setPrefs(company.origin, { loadRemoteMedia: !company.prefs.loadRemoteMedia })}
        />
      </View>

      <Divider style={{ marginVertical: 20 }} />
      <Button kind="danger" label="Remove company" icon={<Trash size={20} color={c.danger} />} onPress={onRemove} />
      <BuildStamp />
    </Sheet>
  );
}

function SheetLabel({ children, first }: { children: string; first?: boolean }) {
  return (
    <Txt variant="small" bold accessibilityRole="header" style={{ marginTop: first ? 0 : 16, marginBottom: 4 }}>
      {children}
    </Txt>
  );
}

function ChipGroup({
  options,
  selected,
  onToggle,
}: {
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  if (options.length === 0) return <Txt variant="small">No messages yet.</Txt>;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => (
        <Chip key={o} label={o} accent={selected.includes(o)} onPress={() => onToggle(o)} />
      ))}
    </View>
  );
}

function ChannelToggle({ channel, onToggle }: { channel: ChannelState; onToggle: (followed: boolean) => void }) {
  const c = useColors();
  return (
    <Row label={channel.displayName} selected={channel.followed} onPress={() => onToggle(!channel.followed)}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Txt bold>{channel.displayName}</Txt>
          {channel.isNew ? (
            <View style={{ backgroundColor: c.accent, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Txt style={{ color: c.onAccent, fontSize: 11, lineHeight: 15, fontWeight: '700', letterSpacing: 0.4 }}>NEW</Txt>
            </View>
          ) : null}
        </View>
        {channel.description ? <Txt variant="small">{channel.description}</Txt> : null}
      </View>
      <Toggle on={channel.followed} />
    </Row>
  );
}
