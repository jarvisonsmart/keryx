/**
 * Root: zero-onboarding first screen (scan a company QR code), contacts
 * list when more than one company is added, straight to the company
 * otherwise (single-source shortcut, per the product brief).
 */

import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider, useApp } from './state';
import { AddCompany } from './ui/AddCompany';
import { Contacts } from './ui/Contacts';
import { CompanyView } from './ui/Company';
import { BuildStamp } from './ui/BuildStamp';
import { getAllItems, getCompany, getItems, type CompanyRecord, type StoredItem } from './lib/store';
import { takeDeepLink } from './lib/deeplink';
import { Button, Loading, Screen, Txt } from './ui/kit';

type Route =
  | { t: 'start' }
  | { t: 'contacts' }
  | { t: 'company'; origin: string }
  | { t: 'add'; from: 'start' | 'contacts'; repairOrigin?: string; deepLink?: string };

export default function App() {
  const { companies, loaded, notification, freshTest, actions } = useApp();
  const [view, setView] = useState<Route>({ t: 'start' });
  const [contactsItems, setContactsItems] = useState<StoredItem[]>([]);

  // Contacts shows unread counts; refresh them whenever the list is shown
  // or the company set changes (e.g. after a sync or Remove company).
  useEffect(() => {
    if (view.t !== 'contacts') return;
    let alive = true;
    void getAllItems().then((list) => {
      if (alive) setContactsItems(list);
    });
    return () => {
      alive = false;
    };
  }, [view.t, companies]);

  // initial routing: single company → straight to it; none → start; else contacts.
  // Also re-routes when the open company disappears (e.g. after Remove company).
  useEffect(() => {
    if (!loaded) return;
    if (view.t === 'company' && !companies.some((c) => c.origin === view.origin)) {
      // the company on screen was removed → route like a fresh load
      if (companies.length === 1) setView({ t: 'company', origin: companies[0].origin });
      else if (companies.length > 1) setView({ t: 'contacts' });
      else setView({ t: 'start' });
      return;
    }
    if (view.t !== 'start' && view.t !== 'contacts') return;
    if (companies.length === 1) {
      setView({ t: 'company', origin: companies[0].origin });
    } else if (companies.length > 1) {
      setView({ t: 'contacts' });
    } else {
      setView({ t: 'start' });
    }
  }, [loaded, companies]);

  // Out-of-spec PWA deep link (?domain=&p=): start pairing immediately. Must
  // stay above the early return below (hooks order must be stable).
  useEffect(() => {
    const url = takeDeepLink();
    if (url) setView({ t: 'add', from: 'start', deepLink: url });
  }, []);

  if (!loaded) return <Loading />;

  if (view.t === 'add') {
    return (
      <AddCompany
        initialUrl={view.deepLink}
        repairOrigin={view.repairOrigin}
        onDone={(origin) => setView({ t: 'company', origin })}
        onCancel={() => {
          if (view.repairOrigin) setView({ t: 'company', origin: view.repairOrigin });
          else if (view.from === 'contacts' || companies.length > 1) setView({ t: 'contacts' });
          else if (companies.length === 1) setView({ t: 'company', origin: companies[0].origin });
          else setView({ t: 'start' });
        }}
      />
    );
  }

  if (view.t === 'contacts') {
    return (
      <Contacts
        companies={companies}
        items={contactsItems}
        notification={notification}
        freshTest={freshTest}
        actions={actions}
        onOpen={(origin) => setView({ t: 'company', origin })}
        onAdd={() => setView({ t: 'add', from: 'contacts' })}
      />
    );
  }

  if (view.t === 'company') {
    return (
      <CompanyRoute
        origin={view.origin}
        onBackToContacts={() => setView({ t: 'contacts' })}
        onRepair={(origin) => setView({ t: 'add', from: 'contacts', repairOrigin: origin })}
        onAddCompany={() => setView({ t: 'add', from: 'start' })}
      />
    );
  }

  // start: zero companies
  return (
    <Screen>
      <View style={{ flexGrow: 1, justifyContent: 'center', paddingBottom: 48 }}>
        <Txt variant="title" style={{ marginBottom: 8 }}>
          Company messages
        </Txt>
        <Txt muted style={{ marginBottom: 24 }}>
          Companies you follow publish here. Messages are verified, so nothing can be faked.
        </Txt>
        <Button label="Add a company" onPress={() => setView({ t: 'add', from: 'start' })} />
        <BuildStamp />
      </View>
    </Screen>
  );
}

function CompanyRoute({
  origin,
  onBackToContacts,
  onRepair,
  onAddCompany,
}: {
  origin: string;
  onBackToContacts: () => void;
  onRepair: (origin: string) => void;
  onAddCompany: () => void;
}) {
  const { companies } = useApp();
  const [company, setCompany] = useState<CompanyRecord | null>(null);
  const [companyItems, setCompanyItems] = useState<StoredItem[]>([]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const c = await getCompany(origin);
      if (alive) setCompany(c ?? null);
      const list = await getItems(origin);
      if (alive) setCompanyItems(list);
    })();
    return () => {
      alive = false;
    };
  }, [origin, companies]);

  if (!company) return <Loading />;

  return (
    <CompanyView company={company} items={companyItems} onBack={onBackToContacts} onRepair={onRepair} onAdd={onAddCompany} />
  );
}

export function Root() {
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <AppProvider>
        <App />
      </AppProvider>
    </SafeAreaProvider>
  );
}
