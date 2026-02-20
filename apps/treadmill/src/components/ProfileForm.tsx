import { useState, useEffect } from 'react';
import type { UserProfile } from '../types.ts';
import { useProfileStore } from '../stores/profile-store.ts';
import { calculateBmi } from '../utils/bmi.ts';

export function ProfileForm() {
  const { profile, setProfile } = useProfileStore();

  const [name, setName] = useState(profile?.name ?? '');
  const [weight, setWeight] = useState(String(profile?.weight ?? ''));
  const [height, setHeight] = useState(String(profile?.height ?? ''));
  const [age, setAge] = useState(String(profile?.age ?? ''));
  const [stride, setStride] = useState(String(profile?.strideLength ?? '0.70'));
  const [gender, setGender] = useState<'male' | 'female'>(profile?.gender ?? 'male');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (profile) {
      setName(profile.name);
      setWeight(String(profile.weight));
      setHeight(String(profile.height));
      setAge(String(profile.age));
      setStride(String(profile.strideLength));
      setGender(profile.gender);
    }
  }, [profile]);

  const handleSave = () => {
    const p: UserProfile = {
      name: name || 'Uzytkownik',
      weight: parseFloat(weight) || 70,
      height: parseFloat(height) || 170,
      age: parseInt(age) || 30,
      strideLength: parseFloat(stride) || 0.7,
      gender,
    };
    setProfile(p);
    setSaved(true);
    setTimeout(() => { setSaved(false); }, 2000);
  };

  const weightNum = parseFloat(weight) || 0;
  const heightNum = parseFloat(height) || 0;
  const bmi = calculateBmi(weightNum, heightNum);

  return (
    <div className="card">
      <div className="card-title">Dane osobowe</div>

      <div className="grid-2">
        <div className="form-group">
          <label className="form-label">Imie</label>
          <input
            type="text"
            className="form-input"
            value={name}
            onChange={(e) => { setName(e.target.value); }}
            placeholder="Twoje imie"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Plec</label>
          <select
            className="form-select"
            value={gender}
            onChange={(e) => { setGender(e.target.value as 'male' | 'female'); }}
          >
            <option value="male">Mezczyzna</option>
            <option value="female">Kobieta</option>
          </select>
        </div>
      </div>

      <div className="grid-2">
        <div className="form-group">
          <label className="form-label">Waga (kg)</label>
          <input
            type="number"
            className="form-input"
            value={weight}
            onChange={(e) => { setWeight(e.target.value); }}
            placeholder="np. 80"
            step="0.1"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Wzrost (cm)</label>
          <input
            type="number"
            className="form-input"
            value={height}
            onChange={(e) => { setHeight(e.target.value); }}
            placeholder="np. 175"
          />
        </div>
      </div>

      <div className="grid-2">
        <div className="form-group">
          <label className="form-label">Wiek</label>
          <input
            type="number"
            className="form-input"
            value={age}
            onChange={(e) => { setAge(e.target.value); }}
            placeholder="np. 30"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Dlugosc kroku (m)</label>
          <input
            type="number"
            className="form-input"
            value={stride}
            onChange={(e) => { setStride(e.target.value); }}
            placeholder="np. 0.70"
            step="0.01"
          />
        </div>
      </div>

      {bmi && (
        <div
          className="mb-16"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: 12,
            background: 'var(--bg-primary)',
            borderRadius: 'var(--radius)',
          }}
        >
          <div>
            <span style={{ fontWeight: 700, fontSize: 18 }}>BMI: {bmi.value.toFixed(1)}</span>
          </div>
          <div
            style={{
              padding: '4px 12px',
              borderRadius: 20,
              background: bmi.color + '22',
              color: bmi.color,
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            {bmi.category}
          </div>
        </div>
      )}

      <button className="btn btn-primary" onClick={handleSave} style={{ width: '100%' }}>
        {saved ? 'Zapisano!' : 'Zapisz profil'}
      </button>
    </div>
  );
}
