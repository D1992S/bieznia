import { useState } from 'react';
import type { TabId } from './types.ts';
import { Layout } from './components/Layout.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { CalendarPage } from './pages/CalendarPage.tsx';
import { StatsPage } from './pages/StatsPage.tsx';
import { ProfilePage } from './pages/ProfilePage.tsx';

export function App() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === 'dashboard' && <DashboardPage />}
      {activeTab === 'calendar' && <CalendarPage />}
      {activeTab === 'stats' && <StatsPage />}
      {activeTab === 'profile' && <ProfilePage />}
    </Layout>
  );
}
