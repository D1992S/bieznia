import type { TabId } from '../types.ts';

interface LayoutProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  children: React.ReactNode;
}

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'dashboard', label: 'Trening' },
  { id: 'calendar', label: 'Kalendarz' },
  { id: 'stats', label: 'Statystyki' },
  { id: 'profile', label: 'Profil' },
];

export function Layout({ activeTab, onTabChange, children }: LayoutProps) {
  return (
    <>
      <header className="app-header">
        <span className="app-title">Bieznia Tracker</span>
        <nav className="tab-nav">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => { onTabChange(tab.id); }}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="app-content">{children}</main>
    </>
  );
}
