import { Text } from './text';
/**
 * Contacts list (shown only when more than one company is added — with a
 * single company the app opens it directly). Each row: logo, name, the join
 * origin as a persistent secondary line, unread count.
 */
import { View } from 'react-native';
import { Plus } from './icons';
import type { CompanyRecord, StoredItem } from '../lib/store';
import type { AppActions } from '../state';
import type { NotificationState } from '../lib/notify';
import { CompanyLogo } from './CompanyLogo';
import { NotificationBanner } from './NotificationBanner';
import { AppBar, IconButton, Row, Screen, Txt } from './kit';
import { radius, useColors } from './theme';

export function Contacts({
  companies,
  items,
  notification,
  freshTest,
  actions,
  onOpen,
  onAdd,
}: {
  companies: CompanyRecord[];
  items: StoredItem[];
  notification: NotificationState;
  freshTest: boolean;
  actions: AppActions;
  onOpen: (origin: string) => void;
  onAdd: () => void;
}) {
  const c = useColors();
  return (
    <Screen
      header={
        <AppBar>
          <Txt variant="section" style={{ flex: 1 }}>
            Messages
          </Txt>
          <IconButton label="Add company" onPress={onAdd}>
            <Plus size={24} color={c.text} />
          </IconButton>
        </AppBar>
      }
    >
      <View style={{ paddingTop: 8 }}>
        <NotificationBanner
          state={notification}
          freshTest={freshTest}
          onEnable={() => void actions.enableNotifications()}
          onCheck={() => void actions.checkNotifications()}
          onRetry={() => void actions.runNotificationSelfTest()}
        />
      </View>
      {companies.map((company, i) => {
        const unread = items.filter((it) => it.origin === company.origin && !it.read).length;
        const name = company.targets.signed.custom?.company_name ?? company.origin;
        return (
          <Row
            key={company.origin}
            label={`${name}, ${company.origin}${unread ? `, ${unread} unread` : ''}`}
            divider={i < companies.length - 1}
            onPress={() => onOpen(company.origin)}
          >
            <CompanyLogo
              url={company.targets.signed.custom?.logo}
              origin={company.origin}
              expectedSha={company.targets.signed.custom?.logo_sha256}
              size={48}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt bold>{name}</Txt>
              <Txt variant="mono" muted style={{ fontSize: 12 }} numberOfLines={1}>
                {company.origin}
              </Txt>
            </View>
            {unread > 0 ? (
              <View style={{ minWidth: 22, height: 22, paddingHorizontal: 7, borderRadius: radius.pill, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: c.onAccent, fontSize: 12, fontWeight: '700' }}>{unread > 99 ? '99+' : unread}</Text>
              </View>
            ) : null}
          </Row>
        );
      })}
    </Screen>
  );
}
