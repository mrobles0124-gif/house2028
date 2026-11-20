
const STATE_FIPS = {
  '01':'AL','02':'AK','04':'AZ','05':'AR','06':'CA',
  '08':'CO','09':'CT','10':'DE','11':'DC','12':'FL',
  '13':'GA','15':'HI','16':'ID','17':'IL','18':'IN',
  '19':'IA','20':'KS','21':'KY','22':'LA','23':'ME',
  '24':'MD','25':'MA','26':'MI','27':'MN','28':'MS',
  '29':'MO','30':'MT','31':'NE','32':'NV','33':'NH',
  '34':'NJ','35':'NM','36':'NY','37':'NC','38':'ND',
  '39':'OH','40':'OK','41':'OR','42':'PA','44':'RI',
  '45':'SC','46':'SD','47':'TN','48':'TX','49':'UT',
  '50':'VT','51':'VA','53':'WA','54':'WV','55':'WI',
  '56':'WY','60':'AS','66':'GU','69':'MP',
  '72':'PR','78':'VI'
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': status === 200
        ? 'public, max-age=0, s-maxage=3600'
        : 'no-store'
    }
  });

export default async (request) => {
  if (request.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const url = new URL(request.url);
  const zip = (url.searchParams.get('zip') || '').trim();

  if (!/^\d{5}$/.test(zip)) {
    return json({
      error: 'Enter a valid five-digit ZIP code.'
    }, 400);
  }

  const key =
    globalThis.Netlify?.env?.get?.('HUD_API_KEY') ||
    process.env.HUD_API_KEY;

  if (!key) {
    return json({
      error: 'HUD API key is not configured.'
    }, 503);
  }

  const endpoint = new URL(
    'https://www.huduser.gov/hudapi/public/usps'
  );

  endpoint.searchParams.set('type', '5');
  endpoint.searchParams.set('query', zip);

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    10000
  );

  try {
    const response = await fetch(endpoint, {
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: 'application/json'
      }
    });

    if (response.status === 404) {
      return json({
        success: true,
        zip,
        districts: [],
        ambiguous: false,
        status: 'not_found',
        source: 'HUD USPS ZIP Code Crosswalk',
        note: 'No crosswalk records found for this ZIP code.'
      });
    }

    if (!response.ok) {
      return json({
        error: 'HUD API request failed.',
        upstreamStatus: response.status
      }, 502);
    }

    const payload = await response.json();

    // HUD commonly returns data as an object.
    // Some responses may wrap it in an array.
    const dataset = Array.isArray(payload.data)
      ? payload.data[0]
      : payload.data;

    if (!dataset || !Array.isArray(dataset.results)) {
      return json({
        error: 'Unexpected HUD API response format.'
      }, 502);
    }

    const districts = [];
    const seen = new Set();
    let unrecognized = 0;

    for (const record of dataset.results) {
      // Congressional district GEOID:
      // 2-digit state FIPS + 2-digit district.
      const geoid = String(record.geoid ?? '').padStart(4, '0');

      if (!/^\d{4}$/.test(geoid)) {
        unrecognized++;
        continue;
      }

      const state = STATE_FIPS[geoid.slice(0, 2)];
      const district = Number(geoid.slice(2));

      if (!state || !Number.isInteger(district)) {
        unrecognized++;
        continue;
      }

      const id = `${state}-${district}`;

      if (seen.has(id)) continue;
      seen.add(id);

      districts.push({
        state,
        district,
        geoid,
        city: record.city || null,
        residentialRatio:
          record.res_ratio == null
            ? null
            : Number(record.res_ratio),
        totalRatio:
          record.tot_ratio == null
            ? null
            : Number(record.tot_ratio)
      });
    }

    if (unrecognized > 0) {
      return json({
        error: 'Some HUD district identifiers could not be interpreted safely.',
        unrecognized
      }, 502);
    }

    districts.sort((a, b) =>
      (b.residentialRatio ?? -1) -
      (a.residentialRatio ?? -1)
    );

    return json({
      success: true,
      zip,
      status: districts.length ? 'matched' : 'not_found',
      districts,
      ambiguous: districts.length > 1,
      matchCount: districts.length,
      dataYear: dataset.year ?? null,
      dataQuarter: dataset.quarter ?? null,
      retrievedAt: new Date().toISOString(),
      source: 'HUD USPS ZIP Code Crosswalk',
      note: districts.length > 1
        ? 'This ZIP code overlaps multiple congressional districts. A full address may be required to identify the correct representative.'
        : 'ZIP-code crosswalks are approximate and do not verify an individual address. Confirm district boundaries with official sources.'
    });

  } catch (error) {
    return json({
      error: error?.name === 'AbortError'
        ? 'HUD request timed out.'
        : 'Unable to contact HUD API.'
    }, 502);
  } finally {
    clearTimeout(timer);
  }
};
