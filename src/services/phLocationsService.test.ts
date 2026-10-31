import { describe, expect, it } from 'vitest';
import { provincesInRegion, REGIONS, regionOf } from './phLocationsService';

describe('region lookups', () => {
  it('derives the region from the PSGC province code', () => {
    expect(regionOf('1043')).toBe('10'); // Misamis Oriental → Northern Mindanao
    expect(regionOf('0722')).toBe('07');
  });

  it('lists each of the 17 regions once', () => {
    expect(REGIONS).toHaveLength(17);
    expect(new Set(REGIONS.map((r) => r.code)).size).toBe(17);
  });

  it('filters provinces by region, deduped by code and sorted', () => {
    const provinces = [
      { code: '1339', name: 'City Of Manila' },
      { code: '1339', name: 'Ncr, City Of Manila, First District' },
      { code: '1374', name: 'Ncr, Second District' },
      { code: '1043', name: 'Misamis Oriental' },
      { code: '1013', name: 'Bukidnon' },
    ];
    expect(provincesInRegion(provinces, '13').map((p) => p.code)).toEqual(['1339', '1374']);
    expect(provincesInRegion(provinces, '10').map((p) => p.name)).toEqual(['Bukidnon', 'Misamis Oriental']);
  });
});
