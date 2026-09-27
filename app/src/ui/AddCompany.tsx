/**
 * Pairing flow: input (scan/paste) → confirm the origin (the only human
 * step — nothing is fetched before it, no name/logo shown) → consent summary
 * (company in the publisher's own signed words) → subscribe.
 */

import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import { ArrowLeft, ArrowRight, ClipboardText, QrCode } from './icons';
import { parseJoinUrl, type JoinPayload } from '../lib/payload';
import { buildPairingOffer, createCompanyFromOffer, type PairingOffer } from '../lib/pair';
import { syncCompany } from '../lib/sync';
import { getItems, deleteItems } from '../lib/store';
import { permissionState, nativeNotificationGranted, type SelfTestResult } from '../lib/notify';
import { openNtfyInstallPage, wakeupsCurrent } from '../lib/push';
import { appPlatform } from '../lib/platform';
import { CompanyLogo } from './CompanyLogo';
import { QrScanner } from './QrScanner';
import { Alert, Button, Card, Loading, Points, Row, Screen, Stack, Toggle, Txt } from './kit';
import { mono, radius, useColors } from './theme';
import { useApp } from '../state';

type Step =
  | { t: 'input'; error?: string }
  | { t: 'scan' }
  | { t: 'confirm'; origin: string; joinUrl: string; payload: JoinPayload }
  | { t: 'loading' }
  | { t: 'consent'; offer: PairingOffer }
  | { t: 'notifications'; origin: string }
  | { t: 'error'; message: string };

const NO_QR = 'No QR code found. Try again or paste the link.';
const NO_CAMERA = 'Camera is not available. Paste the link instead.';

export function AddCompany({
  onDone,
  onCancel,
  repairOrigin,
  initialUrl,
}: {
  onDone: (origin: string) => void;
  onCancel: () => void;
  /** set when re-pairing a company whose name changed (spec/core.md §2) */
  repairOrigin?: string;
  /** set when opened from a PWA deep link — pairing starts without the input screen */
  initialUrl?: string;
}) {
  const [step, setStep] = useState<Step>({ t: 'input' });
  const [pasting, setPasting] = useState(false);
  const [pasteValue, setPasteValue] = useState('');
  const { actions, companies } = useApp();
  const c = useColors();

  // PWA deep link (?domain=&p=): go straight to the origin confirmation.
  useEffect(() => {
    if (initialUrl) startPairing(initialUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startPairing(input: string) {
    try {
      const parsed = parseJoinUrl(input);
      setStep({ t: 'confirm', origin: parsed.origin, joinUrl: parsed.joinUrl, payload: parsed.payload });
    } catch (err) {
      const e = err as Error & { needsNewerApp?: boolean };
      setStep({
        t: 'input',
        error: e.needsNewerApp ? e.message : 'This link is not a valid company link.',
      });
    }
  }

  async function confirmOrigin() {
    if (step.t !== 'confirm') return;
    const { origin, joinUrl, payload } = step;
    setStep({ t: 'loading' });
    try {
      const offer = await buildPairingOffer(origin, joinUrl, payload);
      setStep({ t: 'consent', offer });
    } catch (err) {
      setStep({ t: 'error', message: err instanceof Error ? err.message : 'Could not reach the company.' });
    }
  }

  async function subscribe(offer: PairingOffer, followed: string[]) {
    if (repairOrigin && offer.origin !== repairOrigin) {
      setStep({ t: 'error', message: 'This QR code is for a different company. Use the QR from the company you already follow.' });
      return;
    }
    const firstCompany = companies.length === 0;
    const company = createCompanyFromOffer(offer, followed);
    try {
      // re-pairing keeps the cached items (same origin key); read states preserved
      const existing = new Map((await getItems(company.origin)).map((i) => [i.id, i]));
      const outcome = await syncCompany(company, fetch, existing);
      if (outcome.toDelete.length > 0) await deleteItems(outcome.toDelete);
      if (repairOrigin) {
        await actions.rePairCompany(company.origin, outcome.company, outcome.toPut);
      } else {
        await actions.saveCompany(outcome.company, outcome.toPut);
      }
    } catch {
      if (repairOrigin) {
        await actions.rePairCompany(company.origin, company);
      } else {
        await actions.saveCompany(company);
      }
    }
    if (repairOrigin) {
      onDone(company.origin);
      return;
    }
    // a later company with permission already granted and the registration
    // current skips the screen and self-tests silently: no prompt is possible
    if (!firstCompany) {
      // the transport-aware "permission already granted": the native
      // permission on the apps, the browser permission on the web
      const permissionOk =
        appPlatform() === 'web' ? permissionState() === 'granted' : await nativeNotificationGranted();
      if (permissionOk && (await wakeupsCurrent(company))) {
        await actions.runNotificationSelfTest();
        onDone(company.origin);
        return;
      }
    }
    setStep({ t: 'notifications', origin: company.origin });
  }

  switch (step.t) {
    case 'scan':
      return (
        <QrScanner
          onResult={startPairing}
          onError={(reason) => setStep({ t: 'input', error: reason === 'no-code' ? NO_QR : NO_CAMERA })}
          onCancel={() => setStep({ t: 'input' })}
        />
      );

    case 'input':
      return (
        <Screen>
          <View style={{ flexGrow: 1, justifyContent: 'center', paddingBottom: 48 }}>
            <Txt variant="title">Add a company</Txt>
            <Txt muted style={{ marginBottom: 24 }}>
              Scan the QR code a company printed or showed you. Its announcements will appear here, verified.
            </Txt>
            {pasting ? (
              <Stack>
                <TextInput
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect={false}
                  inputMode="url"
                  placeholder="Paste the company link or domain"
                  placeholderTextColor={c.text2}
                  accessibilityLabel="Company link or domain"
                  value={pasteValue}
                  onChangeText={setPasteValue}
                  onSubmitEditing={() => pasteValue.trim() && startPairing(pasteValue)}
                  style={{
                    minHeight: 50,
                    paddingHorizontal: 18,
                    borderWidth: 1,
                    borderColor: c.borderStrong,
                    borderRadius: radius.pill,
                    backgroundColor: c.surface,
                    color: c.text,
                    fontSize: 16,
                  }}
                />
                <Button label="Continue" disabled={!pasteValue.trim()} onPress={() => startPairing(pasteValue)} />
                <Button
                  kind="secondary"
                  label="Back"
                  onPress={() => {
                    setPasting(false);
                    setPasteValue('');
                  }}
                />
              </Stack>
            ) : (
              <Stack>
                <Button
                  label="Scan QR code"
                  icon={<QrCode size={22} color={c.onAccent} />}
                  onPress={() => setStep({ t: 'scan' })}
                />
                <Button
                  kind="secondary"
                  label="Paste a link"
                  icon={<ClipboardText size={20} color={c.text} />}
                  onPress={() => setPasting(true)}
                />
                <Button kind="ghost" label="Back" icon={<ArrowLeft size={20} color={c.accent} />} onPress={onCancel} />
              </Stack>
            )}
            {step.error ? (
              <View style={{ marginTop: 8 }}>
                <Alert danger>{step.error}</Alert>
              </View>
            ) : null}
          </View>
        </Screen>
      );

    case 'confirm':
      return (
        <Screen>
          <Txt variant="title" style={{ marginBottom: 8 }}>
            Confirm this website
          </Txt>
          <Txt muted>You are subscribing to messages from:</Txt>
          <Card style={{ marginVertical: 16, padding: 20 }}>
            <Txt style={{ fontFamily: mono }} selectable>
              {step.origin}
            </Txt>
          </Card>
          <Txt variant="small">
            Check that this is the company's real website address. This is the only thing you confirm. Everything
            after this is verified automatically.
          </Txt>
          <Stack style={{ marginTop: 16 }}>
            <Button
              label="Continue"
              icon={<ArrowRight size={20} color={c.onAccent} />}
              onPress={() => void confirmOrigin()}
            />
            <Button kind="secondary" label="Cancel" onPress={onCancel} />
          </Stack>
        </Screen>
      );

    case 'loading':
      return <Loading label="Checking the company's signed metadata…" />;

    case 'consent':
      return (
        <ConsentScreen
          offer={step.offer}
          onSubscribe={(followed) => subscribe(step.offer, followed)}
          onBack={() =>
            setStep({
              t: 'confirm',
              origin: step.offer.origin,
              joinUrl: step.offer.joinUrl,
              payload: parseJoinUrl(step.offer.joinUrl).payload,
            })
          }
        />
      );

    case 'notifications':
      return <NotificationsScreen onEnable={() => actions.enableNotifications()} onDone={() => onDone(step.origin)} />;

    case 'error':
      return (
        <Screen>
          <Alert danger title="Could not add this company">
            {step.message}
          </Alert>
          <View style={{ marginTop: 16 }}>
            <Button label="Back" onPress={onCancel} />
          </View>
        </Screen>
      );
  }
}

function ConsentScreen({
  offer,
  onSubscribe,
  onBack,
}: {
  offer: PairingOffer;
  onSubscribe: (followed: string[]) => Promise<void>;
  onBack: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(offer.channels.filter((ch) => ch.suggested).map((ch) => ch.name)),
  );
  // subscribing runs the TUF chain, which can take seconds: show it in the button
  const [busy, setBusy] = useState(false);

  function toggle(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  return (
    <Screen top={32}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <CompanyLogo url={offer.logo} origin={offer.origin} expectedSha={offer.logoSHA256} size={56} />
        <View style={{ flex: 1 }}>
          <Txt variant="section">{offer.companyName}</Txt>
          <Txt variant="mono" muted style={{ fontSize: 12 }}>
            {offer.origin}
          </Txt>
        </View>
      </View>

      <Txt variant="section" accessibilityRole="header" style={{ marginBottom: 4 }}>
        Choose what to follow
      </Txt>
      <Txt variant="small">Tap to subscribe to each channel. You can change this later.</Txt>

      <View style={{ marginVertical: 8 }}>
        {offer.channels.map((ch, i) => (
          <Row
            key={ch.name}
            label={ch.displayName}
            selected={selected.has(ch.name)}
            divider={i < offer.channels.length - 1}
            onPress={() => toggle(ch.name)}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt bold>{ch.displayName}</Txt>
              {ch.description ? <Txt variant="small" style={{ marginTop: 2 }}>{ch.description}</Txt> : null}
            </View>
            <Toggle on={selected.has(ch.name)} />
          </Row>
        ))}
      </View>

      {offer.privateFeeds.length > 0 ? (
        <>
          <Txt variant="section" accessibilityRole="header" style={{ marginTop: 16, marginBottom: 4 }}>
            Included with this order
          </Txt>
          <Txt variant="small">These are added automatically. They contain your order details only.</Txt>
          <Card style={{ marginVertical: 8 }}>
            {offer.privateFeeds.map((f) =>
              f.valid ? (
                <View key={f.url} style={{ paddingVertical: 6 }}>
                  <Txt bold>{f.displayName ?? 'Private feed'}</Txt>
                  {f.purpose ? <Txt variant="small">{f.purpose}</Txt> : null}
                </View>
              ) : (
                <Txt key={f.url} variant="small" style={{ paddingVertical: 6 }}>
                  One link could not be verified, so it was not added.
                </Txt>
              ),
            )}
          </Card>
        </>
      ) : null}

      <Stack style={{ marginTop: 12 }}>
        <Button
          label="Subscribe"
          busy={busy}
          disabled={selected.size === 0 && offer.privateFeeds.length === 0}
          onPress={async () => {
            setBusy(true);
            try {
              await onSubscribe([...selected]);
            } catch {
              setBusy(false);
            }
          }}
        />
        <Button kind="secondary" label="Back" disabled={busy} onPress={onBack} />
      </Stack>
    </Screen>
  );
}

/**
 * The first-company "Turn on notifications" screen (design/notifications.md):
 * the only prompt surface, with no skip. The tap is the user gesture the
 * browser requires; the app then registers and self-tests. A slow first push
 * is neutral, never red: the pending nonce keeps listening until it lands.
 */
function NotificationsScreen({
  onEnable,
  onDone,
}: {
  onEnable: () => Promise<SelfTestResult>;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<'idle' | 'busy' | 'pending' | 'failed' | 'green'>('idle');
  const { notification, actions } = useApp();
  const settings = appPlatform() === 'web' ? 'your browser or system settings' : 'the system settings';

  // the app-wide state upgrades when the late nonce lands: show green briefly,
  // then continue to the company view
  useEffect(() => {
    if (phase !== 'pending') return;
    if (notification.kind === 'ok' && notification.testedAt) setPhase('green');
    else if (notification.kind === 'failed') setPhase('failed');
  }, [phase, notification.kind, notification.testedAt]);

  // continue once, and never cancel the timer just because the app-wide state
  // was re-read (the notification object is rebuilt on every poll)
  useEffect(() => {
    if (phase !== 'green') return;
    const t = setTimeout(onDone, 2000);
    return () => clearTimeout(t);
  }, [phase, onDone]);

  if (notification.kind === 'checking') {
    return <Loading label="Checking notifications…" />;
  }
  if (notification.kind === 'no-transport') {
    return (
      <Screen>
        <Txt variant="title">Notifications need ntfy</Txt>
        <Txt muted style={{ marginTop: 8, marginBottom: 12 }}>
          This phone has no Google services, so Keryx uses ntfy — a free, open-source push app — to deliver timely
          updates.
        </Txt>
        <Points
          items={[
            ['Install ntfy.', 'The F-Droid build works without Google services.'],
            ['Let it run.', 'Disable battery optimization for ntfy so wake-ups are not delayed.'],
            ['You are in control.', 'ntfy only carries Keryx wake-ups — never your content.'],
          ]}
        />
        <Stack>
          <Button label="Install ntfy" onPress={() => void openNtfyInstallPage()} />
          <Button kind="secondary" label="Check again" onPress={() => void actions.checkNotifications()} />
        </Stack>
      </Screen>
    );
  }
  if (notification.kind === 'unsupported') {
    // nothing to turn on here (no push service): polling is the backstop
    return (
      <Screen>
        <Txt variant="title">Notifications</Txt>
        <Txt muted style={{ marginTop: 8, marginBottom: 24 }}>
          Notifications are unavailable {appPlatform() === 'web' ? 'in this browser' : 'on this device'}. New
          messages still appear whenever you open the app.
        </Txt>
        <Button label="Continue" onPress={onDone} />
      </Screen>
    );
  }
  return (
    <Screen>
      <Txt variant="title">Turn on notifications</Txt>
      <Txt muted style={{ marginTop: 8, marginBottom: 12 }}>
        Timely updates — security incidents and order status — reach this device only with notifications on.
      </Txt>
      <Points
        items={[
          [
            'Allow them in the next step.',
            `We strongly recommend it — the app works as expected only with notifications on. No second ask: decline, and you will have to allow notifications yourself, in ${settings}.`,
          ],
          ['No spam.', 'Only the companies you follow can reach you — and only on the channels you keep on.'],
          [
            'You are in control.',
            `Turn any channel off to silence it, or turn notifications off entirely, in ${settings}.`,
          ],
        ]}
      />
      {phase === 'green' ? (
        <View style={{ marginBottom: 16 }}>
          <Alert>Notifications are working.</Alert>
        </View>
      ) : phase === 'pending' ? (
        <View style={{ marginBottom: 16 }}>
          <Alert>
            Notifications are on. The first test is still on its way — it can take a minute; you can keep using the
            app.
          </Alert>
        </View>
      ) : phase === 'failed' ? (
        <View style={{ marginBottom: 16 }}>
          <Alert danger>
            {notification.leg === 'topic'
              ? 'Notifications could not be set up. Try again.'
              : `Notifications are off. Allow them in ${settings}, then try again.`}
          </Alert>
        </View>
      ) : null}
      <Stack>
        <Button
          label="Turn on"
          busy={phase === 'busy'}
          onPress={async () => {
            setPhase('busy');
            const result = await onEnable();
            if (result.endpoint === 'delivered') onDone();
            else setPhase(result.endpoint === 'pending' ? 'pending' : 'failed');
          }}
        />
        {phase === 'pending' ? <Button kind="secondary" label="Continue" onPress={onDone} /> : null}
      </Stack>
    </Screen>
  );
}
