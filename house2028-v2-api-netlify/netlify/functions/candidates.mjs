
const STATES = new Set(
  'AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VA VT WA WV WI WY DC'.split(' ')
);

const MAX_PAGES = 5;
const PER_PAGE = 100;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': status === 200
        ? 'public, max-age=0, s-maxage=900'
        : 'no-store'
    }
  });

export default async (request) => {
  if (request.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const url = new URL(request.url);

  const state = (url.searchParams.get('state') || '')
    .trim().toUpperCase();

  const districtText = (
    url.searchParams.get('district') || ''
  ).trim();

  const yearText = (
    url.searchParams.get('year') || '2028'
  ).trim();

  const district = Number(districtText);
  const year = Number(yearText);

  if (
    !STATES.has(state) ||
    !/^(?:0|[1-9][0-9]?)$/.test(districtText) ||
    district > 99 ||
    !/^\d{4}$/.test(yearText) ||
    year < 2026 ||
    year > 2100 ||
    year % 2 !== 0
  ) {
    return json({
      error: 'Invalid state, district, or election year.'
    }, 400);
  }

  const key =
    globalThis.Netlify?.env?.get?.('FEC_API_KEY') ||
    process.env.FEC_API_KEY;

  if (!key) {
    return json({
      error: 'FEC API key is not configured.'
    }, 503);
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    8500
  );

  try {
    const records = [];
    let totalMatchingRecords = null;
    let totalPages = 1;
    let pagesFetched = 0;

    for (let page = 1; page <= MAX_PAGES; page++) {
      const endpoint = new URL(
        'https://api.open.fec.gov/v1/candidates/'
      );

      endpoint.searchParams.set('api_key', key);
      endpoint.searchParams.set('office', 'H');
      endpoint.searchParams.set('state', state);
      endpoint.searchParams.set('district', String(district));
      endpoint.searchParams.set('election_year', String(year));
      endpoint.searchParams.set('per_page', String(PER_PAGE));
      endpoint.searchParams.set('page', String(page));

      const response = await fetch(endpoint, {
        signal: controller.signal,
        headers: { Accept: 'application/json' }
      });

      if (!response.ok) {
        return json({
          error: 'FEC API request failed.',
          upstreamStatus: response.status
        }, 502);
      }

      const data = await response.json();

      const results = Array.isArray(data.results)
        ? data.results
        : [];

      records.push(...results);
      pagesFetched++;

      totalMatchingRecords =
        data.pagination?.count ?? totalMatchingRecords;

      totalPages = Number(
        data.pagination?.pages || 1
      );

      if (page >= totalPages || results.length === 0) {
        break;
      }
    }

    // Validate the requested district and election cycle.
    const filtered = records.filter(c => {
      const years = Array.isArray(c.election_years)
        ? c.election_years.map(Number)
        : [];

      return (
        c.office === 'H' &&
        String(c.state || '').toUpperCase() === state &&
        Number(c.district) === district &&
        years.includes(year)
      );
    });

    // Deduplicate using the official FEC candidate ID.
    const unique = new Map();

    for (const candidate of filtered) {
      if (!candidate.candidate_id) continue;

      if (!unique.has(candidate.candidate_id)) {
        unique.set(candidate.candidate_id, candidate);
      }
    }

    const candidates = [...unique.values()]
      .map(c => ({
        candidateId: c.candidate_id,
        name: c.name || 'Name unavailable',
        party: c.party_full || c.party || 'Not listed',
        state,
        district,
        electionYears: c.election_years || [],
        candidateStatus: c.candidate_status || null,
        fecUrl:
          `https://www.fec.gov/data/candidate/${encodeURIComponent(c.candidate_id)}/`
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return json({
      demo: false,
      state,
      district,
      electionYear: year,
      candidates,
      returnedCount: candidates.length,
      totalMatchingRecords,
      pagesFetched,
      totalPages,
      complete: pagesFetched >= totalPages,
      retrievedAt: new Date().toISOString(),
      source: 'Federal Election Commission',
      note:
        'FEC records do not establish active campaigning or ballot qualification. ' +
        'Results may include historical registrations. ' +
        'For informational purposes only; no endorsements or voting recommendations.'
    });

  } catch (error) {
    return json({
      error: error?.name === 'AbortError'
        ? 'FEC request timed out.'
        : 'Unable to retrieve FEC data.'
    }, 502);
  } finally {
    clearTimeout(timer);
  }
};
