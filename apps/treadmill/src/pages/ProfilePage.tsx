import { ProfileForm } from '../components/ProfileForm.tsx';
import { GoalsPanel } from '../components/GoalsPanel.tsx';
import { PaceDisplay } from '../components/PaceDisplay.tsx';
import { StreakBadges } from '../components/StreakBadges.tsx';

export function ProfilePage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <ProfileForm />
      <div className="grid-2">
        <GoalsPanel />
        <PaceDisplay />
      </div>
      <StreakBadges />
    </div>
  );
}
