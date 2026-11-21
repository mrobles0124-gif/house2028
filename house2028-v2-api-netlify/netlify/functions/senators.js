

const STATES = new Set(
  (
    'AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME ' +
    'MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA ' +
    'RI SC SD TN TX UT VT VA WA WV WI WY'
  ).split(' ')
);


const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=900',
      ...extra
    }
  });

export default async (request) => {
  if (request.method !== 'GET') {
    return json(
      { error: 'Method not allowed.' },
      405,
      { Allow: 'GET' }
    );
  }

  const url = new URL(request.url);
  const state = (url.searchParams.get('state') || '')
    .trim()
    .toUpperCase();

  if (!STATES.has(state)) {
    return json({
      error: 'Choose a valid U.S. state.'
    }, 400, { 'Cache-Control': 'no-store' });
  }

  const key =
    globalThis.Netlify?.env?.get?.('CONGRESS_API_KEY') ||
    process.env.CONGRESS_API_KEY;

  if (!key) {
    return json({
      error: 'Congress.gov API key is not configured.'
    }, 503, { 'Cache-Control': 'no-store' });
  }

  const endpoint = new URL(
    `https://api.congress.gov/v3/member/${state}`
  );

  endpoint.searchParams.set('api_key', key);
  endpoint.searchParams.set('format', 'json');
  endpoint.searchParams.set('currentMember', 'true');
  endpoint.searchParams.set('limit', '250');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8500);

  try {
    const response = await fetch(endpoint, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) {
      return json({
        error: 'Congress.gov returned an error.',
        upstreamStatus: response.status
      }, 502, { 'Cache-Control': 'no-store' });
    }

    const data = await response.json();

    const members = Array.isArray(data.members)
      ? data.members
      : [];

    // The state endpoint includes House members too.
    // Keep only members whose service includes the Senate.
    const senators = members.filter(member => {
      const terms = Array.isArray(member.terms?.item)
        ? member.terms.item
        : [];

      return terms.some(term =>
        String(term.chamber || '').toLowerCase() === 'senate'
      );
    }).map(member => ({
      bioguideId: String(member.bioguideId || ''),
      name: String(
        member.directOrderName ||
        member.name ||
        'Name unavailable'
      ),
      party: String(
        member.partyName ||
        member.party ||
        'Not listed'
      ),
      state,
      chamber: 'Senate',
      congressUrl: member.bioguideId
        ? `https://www.congress.gov/member/${encodeURIComponent(member.bioguideId)}`
        : null
    }));

    return json({
      demo: false,
      state,
      senators,
      count: senators.length,
      retrievedAt: new Date().toISOString(),
      source: 'Congress.gov API',
      note: 'Current Senate member records. Vacancies and data updates may affect results.'
    });

  } catch (error) {
    return json({
      error: error?.name === 'AbortError'
        ? 'Congress.gov request timed out.'
        : 'Unable to contact Congress.gov.'
    }, 502, { 'Cache-Control': 'no-store' });

  } finally {
    clearTimeout(timer);
  }
};
