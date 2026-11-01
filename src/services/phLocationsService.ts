/* =========================================================================
   KEZMOTO - Philippine province / city / barangay lookups

   Static data under public/data/ph-locations/, prepared once from the
   isaacdarcilla/philippine-addresses dataset (Apache-2.0) and trimmed to
   just {code, name} - provinces.json (~3KB) and cities.json (~98KB) are
   small enough to fetch in full and filter client-side; barangays.json
   would be ~4.8MB and ~42,000 rows for the whole country, so those are
   pre-split into one small file per city (barangays/<cityCode>.json) and
   only ever fetched for the one city just picked. Each list is cached in
   memory after its first fetch - the Sell form's Location step re-mounts
   whenever the wizard step changes, so without this every step visit
   would re-fetch.
   ========================================================================= */

export interface PhRegion {
  code: string;
  name: string;
}

export interface PhProvince {
  code: string;
  name: string;
}

/** The 17 regions. A province's PSGC code starts with its region's two
    digits, so no region file is needed - see regionOf(). */
export const REGIONS: PhRegion[] = [
  { code: '13', name: 'NCR – Metro Manila' },
  { code: '14', name: 'CAR – Cordillera' },
  { code: '01', name: 'Region I – Ilocos' },
  { code: '02', name: 'Region II – Cagayan Valley' },
  { code: '03', name: 'Region III – Central Luzon' },
  { code: '04', name: 'Region IV-A – CALABARZON' },
  { code: '17', name: 'Region IV-B – MIMAROPA' },
  { code: '05', name: 'Region V – Bicol' },
  { code: '06', name: 'Region VI – Western Visayas' },
  { code: '07', name: 'Region VII – Central Visayas' },
  { code: '08', name: 'Region VIII – Eastern Visayas' },
  { code: '09', name: 'Region IX – Zamboanga Peninsula' },
  { code: '10', name: 'Region X – Northern Mindanao' },
  { code: '11', name: 'Region XI – Davao' },
  { code: '12', name: 'Region XII – SOCCSKSARGEN' },
  { code: '16', name: 'Region XIII – Caraga' },
  { code: '15', name: 'BARMM' },
];

export const regionOf = (provinceCode: string): string => provinceCode.slice(0, 2);

/** Provinces in one region, deduped by code (the dataset lists NCR's
    "1339" twice) and sorted by name. */
export const provincesInRegion = (provinces: PhProvince[], regionCode: string): PhProvince[] => {
  const seen = new Set<string>();
  return provinces
    .filter((p) => regionOf(p.code) === regionCode && !seen.has(p.code) && seen.add(p.code))
    .sort((a, b) => a.name.localeCompare(b.name));
};

export interface PhCity {
  code: string;
  name: string;
  provinceCode: string;
}

export interface PhBarangay {
  code: string;
  name: string;
}

let provincesCache: PhProvince[] | null = null;
let citiesCache: PhCity[] | null = null;
const barangaysCache = new Map<string, PhBarangay[]>();

const fetchJson = async <T>(path: string): Promise<T> => {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status}).`);
  return (await res.json()) as T;
};

export const phLocationsApi = {
  async listProvinces(): Promise<PhProvince[]> {
    if (!provincesCache) {
      provincesCache = await fetchJson<PhProvince[]>('/data/ph-locations/provinces.json');
    }
    return provincesCache;
  },

  /** All cities, nationwide - callers filter by provinceCode themselves
      (cheap in-memory filter, cheaper than a second data shape). */
  async listCities(): Promise<PhCity[]> {
    if (!citiesCache) {
      citiesCache = await fetchJson<PhCity[]>('/data/ph-locations/cities.json');
    }
    return citiesCache;
  },

  async listBarangays(cityCode: string): Promise<PhBarangay[]> {
    const cached = barangaysCache.get(cityCode);
    if (cached) return cached;
    const list = await fetchJson<PhBarangay[]>(`/data/ph-locations/barangays/${cityCode}.json`);
    barangaysCache.set(cityCode, list);
    return list;
  },
};
