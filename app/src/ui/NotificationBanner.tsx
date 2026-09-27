/**
 * App-wide notification status banner (design/notifications.md): red when
 * wake-ups are off and neutral while a test is in flight. A healthy install
 * shows no bar: the green "Notifications are working" is only the tail of an
 * enable/retry in this session, never a persistent status row.
 */
import type { NotificationState } from '../lib/notify';
import { appPlatform } from '../lib/platform';
import { openNtfyInstallPage } from '../lib/push';
import { Banner, Button } from './kit';

export function NotificationBanner({
  state,
  freshTest,
  onEnable,
  onCheck,
  onRetry,
}: {
  state: NotificationState;
  /** a self-test completed in this session: show the green enable-workflow tail */
  freshTest: boolean;
  onEnable: () => void;
  onCheck: () => void;
  onRetry: () => void;
}) {
  const settings = appPlatform() === 'web' ? 'your browser or system settings' : 'the system settings';
  switch (state.kind) {
    case 'checking':
      return null;
    case 'no-transport':
      return (
        <Banner
          tone="danger"
          text="Notifications need ntfy on this device."
          actions={
            <>
              <Button compact label="Install ntfy" onPress={() => void openNtfyInstallPage()} />
              <Button compact kind="secondary" label="Check again" onPress={onCheck} />
            </>
          }
        />
      );
    case 'unsupported':
      return (
        <Banner
          tone="neutral"
          text={`Notifications are unavailable ${appPlatform() === 'web' ? 'in this browser' : 'on this device'} — messages still arrive by polling.`}
        />
      );
    case 'pending':
      return <Banner tone="neutral" text="Notifications are on — the first test is still on its way." />;
    case 'ok':
      return freshTest ? <Banner tone="ok" text="Notifications are working." /> : null;
    case 'default':
    case 'no-subscription':
      return (
        <Banner
          tone="danger"
          text="Turn on notifications to get timely updates."
          actions={<Button compact label="Turn on" onPress={onEnable} />}
        />
      );
    case 'unregistered':
      return (
        <Banner
          tone="danger"
          text="Notifications need to be re-enabled."
          actions={<Button compact label="Re-subscribe" onPress={onEnable} />}
        />
      );
    case 'denied':
      return (
        <Banner
          tone="danger"
          text={`Notifications are off. Allow them in ${settings}, then check again.`}
          actions={<Button compact label="Check again" onPress={onCheck} />}
        />
      );
    case 'failed':
      return (
        <Banner
          tone="danger"
          text={
            state.leg === 'registration'
              ? 'Notifications could not be registered. Try again.'
              : state.leg === 'topic'
                ? 'The test notification was not sent. Try again.'
                : 'The test notification did not arrive. Try again.'
          }
          actions={<Button compact label="Try again" onPress={onRetry} />}
        />
      );
  }
}
