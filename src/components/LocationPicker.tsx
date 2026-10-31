import React, { useEffect, useMemo, useState } from 'react';
import { phLocationsApi, provincesInRegion, REGIONS } from '../services/phLocationsService';
import type { PhBarangay, PhCity, PhProvince } from '../services/phLocationsService';
import './LocationPicker.css';

interface LocationPickerProps {
  /** The saved location text — shown as "Currently: …" until the user picks anew. */
  value?: string;
  /** Called with "Barangay, City, Province" (or "City, Province"), or '' while incomplete. */
  onChange: (location: string) => void;
  /** Label for the empty barangay option, e.g. "Any barangay" on Wanted posts. */
  barangayPlaceholder?: string;
  /** Each picked level by name (empty while not picked), for callers that
      store them separately, e.g. Create account. */
  onPartsChange?: (parts: LocationParts) => void;
}

export interface LocationParts {
  region: string;
  province: string;
  city: string;
  barangay: string;
}

/**
 * Region → Province → City / Municipality → Barangay, as four cascading
 * dropdowns. Picking a level resets everything below it. The composed
 * text is what gets saved, so listings keep storing one plain location.
 */
const LocationPicker: React.FC<LocationPickerProps> = ({
  value,
  onChange,
  barangayPlaceholder = 'Select barangay (optional)…',
  onPartsChange,
}) => {
  const [provinces, setProvinces] = useState<PhProvince[]>([]);
  const [cities, setCities] = useState<PhCity[]>([]);
  const [barangays, setBarangays] = useState<PhBarangay[]>([]);
  const [regionCode, setRegionCode] = useState('');
  const [provinceCode, setProvinceCode] = useState('');
  const [cityCode, setCityCode] = useState('');
  const [barangayCode, setBarangayCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([phLocationsApi.listProvinces(), phLocationsApi.listCities()])
      .then(([p, c]) => {
        setProvinces(p);
        setCities(c);
      })
      .catch(() => setError('Could not load the list of places. Check your connection and reload.'));
  }, []);

  useEffect(() => {
    if (!cityCode) {
      setBarangays([]);
      return;
    }
    let cancelled = false;
    phLocationsApi
      .listBarangays(cityCode)
      .then((list) => {
        if (!cancelled) setBarangays([...list].sort((a, b) => a.name.localeCompare(b.name)));
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the barangays for that city. Try again.');
      });
    return () => {
      cancelled = true;
    };
  }, [cityCode]);

  const regionProvinces = useMemo(() => provincesInRegion(provinces, regionCode), [provinces, regionCode]);
  const provinceCities = useMemo(
    () =>
      cities
        .filter((c) => c.provinceCode === provinceCode)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [cities, provinceCode]
  );

  const compose = (pCode: string, cCode: string, bCode: string, rCode = regionCode) => {
    const province = provinces.find((p) => p.code === pCode);
    const city = cities.find((c) => c.code === cCode);
    onPartsChange?.({
      region: REGIONS.find((r) => r.code === rCode)?.name ?? '',
      province: province?.name ?? '',
      // The list marks provincial capitals ("… City (Capital)"); not part of the name.
      city: city?.name.replace(/\s*\(capital\)$/i, '') ?? '',
      barangay: barangays.find((b) => b.code === bCode)?.name ?? '',
    });
    if (!province || !city) {
      onChange('');
      return;
    }
    const barangay = barangays.find((b) => b.code === bCode);
    onChange((barangay ? [barangay.name, city.name, province.name] : [city.name, province.name]).join(', '));
  };

  const pickRegion = (code: string) => {
    setRegionCode(code);
    setProvinceCode('');
    setCityCode('');
    setBarangayCode('');
    compose('', '', '', code);
  };

  const pickProvince = (code: string) => {
    setProvinceCode(code);
    setCityCode('');
    setBarangayCode('');
    compose(code, '', '');
  };

  const pickCity = (code: string) => {
    setCityCode(code);
    setBarangayCode('');
    compose(provinceCode, code, '');
  };

  const pickBarangay = (code: string) => {
    setBarangayCode(code);
    compose(provinceCode, cityCode, code);
  };

  const loading = provinces.length === 0 && !error;

  return (
    <div className="loc-picker">
      {value && !regionCode && (
        <p className="loc-picker__current">
          Currently: <strong>{value}</strong>. Pick below to change it.
        </p>
      )}
      {error && <p className="kez-form-error">{error}</p>}

      <div className="loc-picker__grid">
        <label className="kez-field loc-picker__field">
          <span>Region</span>
          <select value={regionCode} onChange={(e) => pickRegion(e.target.value)} disabled={loading}>
            <option value="">{loading ? 'Loading…' : 'Select region…'}</option>
            {REGIONS.map((r) => (
              <option key={r.code} value={r.code}>
                {r.name}
              </option>
            ))}
          </select>
        </label>

        <label className="kez-field loc-picker__field">
          <span>Province</span>
          <select value={provinceCode} onChange={(e) => pickProvince(e.target.value)} disabled={!regionCode}>
            <option value="">{regionCode ? 'Select province…' : 'Pick a region first'}</option>
            {regionProvinces.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <label className="kez-field loc-picker__field">
          <span>City / Municipality</span>
          <select value={cityCode} onChange={(e) => pickCity(e.target.value)} disabled={!provinceCode}>
            <option value="">{provinceCode ? 'Select city / municipality…' : 'Pick a province first'}</option>
            {provinceCities.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="kez-field loc-picker__field">
          <span>Barangay</span>
          <select value={barangayCode} onChange={(e) => pickBarangay(e.target.value)} disabled={!cityCode}>
            <option value="">{cityCode ? barangayPlaceholder : 'Pick a city first'}</option>
            {barangays.map((b) => (
              <option key={b.code} value={b.code}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
};

export default LocationPicker;
