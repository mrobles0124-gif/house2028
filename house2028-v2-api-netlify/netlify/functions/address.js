
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });

export default async (request) => {
  if (request.method !== 'GET') {
    return json({ error: 'Method not allowed.' }, 405);
  }

  const url = new URL(request.url);
  const address = (url.searchParams.get('address') || '').trim();

  if (
    address.length < 10 ||
    address.length > 250 ||
    !/^\d/.test(address)
  ) {
    return json({
      error: 'Enter a complete street address, city, state, and ZIP.'
    }, 400);
  }

  const endpoint = new URL(
    'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress'
  );

  endpoint.searchParams.set('address', address);
  endpoint.searchParams.set('benchmark', 'Public_AR_Current');
  endpoint.searchParams.set('vintage', 'Current_Current');
  endpoint.searchParams.set('format', 'json');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(endpoint, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) {
      return json({
        error: 'Census geocoding service returned an error.',
        upstreamStatus: response.status
      }, 502);
    }

    const data = await response.json();
    const matches = data.result?.addressMatches || [];

    if (matches.length === 0) {
      return json({
        success: true,
        status: 'not_found',
        districts: [],
        note: 'No address match found. Check the address and try again.'
      });
    }

    const districts = [];
    const seen = new Set();

    for (const match of matches) {
      const geographies = match.geographies || {};

      for (const [layerName, records] of Object.entries(geographies)) {
        if (!/congressional districts/i.test(layerName)) continue;
        if (!Array.isArray(records)) continue;

        for (const record of records) {
          const stateFips = String(record.STATE || '').padStart(2, '0');
          const stateCodes = {
            '01':'AL','02':'AK','04':'AZ','05':'AR',
            '06':'CA','08':'CO','09':'CT','10':'DE',
            '11':'DC','12':'FL','13':'GA','15':'HI',
            '16':'ID','17':'IL','18':'IN','19':'IA',
            '20':'KS','21':'KY','22':'LA','23':'ME',
            '24':'MD','25':'MA','26':'MI','27':'MN',
            '28':'MS','29':'MO','30':'MT','31':'NE',
            '32':'NV','33':'NH','34':'NJ','35':'NM',
            '36':'NY','37':'NC','38':'ND','39':'OH',
            '40':'OK','41':'OR','42':'PA','44':'RI',
            '45':'SC','46':'SD','47':'TN','48':'TX',
            '49':'UT','50':'VT','51':'VA','53':'WA',
            '54':'WV','55':'WI','56':'WY',
            '60':'AS','66':'GU','69':'MP','72':'PR','78':'VI'
          };

          const state = stateCodes[stateFips];

          // Prefer the Census district code over a display name.
          const districtText = String(record.CD119 ?? record.CD118 ??
            record.BASENAME ?? '').trim();

          if (!/^\d{1,2}$/.test(districtText) || !state) continue;

          const district = Number(districtText);
          if (district > 99) continue;

          const key = `${state}-${district}`;

          if (!seen.has(key)) {
            seen.add(key);
            districts.push({ state, district });
          }
        }
      }
    }

    return json({
      success: true,
      status: districts.length
        ? (districts.length === 1 && matches.length === 1
            ? 'matched'
            : 'ambiguous')
        : 'geography_unavailable',
      districts,
      matchCount: matches.length,
      retrievedAt: new Date().toISOString(),
      source: 'U.S. Census Bureau Geocoding Service',
      note: 'Address geocoding is approximate and may use interpolated address ranges. Verify congressional district assignments with official sources.'
    });

  } catch (error) {
    return json({
      error: error?.name === 'AbortError'
        ? 'Census lookup timed out.'
        : 'Unable to retrieve Census address data.'
    }, 502);
  } finally {
    clearTimeout(timer);
  }
};
