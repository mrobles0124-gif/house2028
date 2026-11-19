// API learning exercise: a small backend proxy that keeps the API key private.
// Called from the browser as /.netlify/functions/representative?state=CA&district=12
const STATES = new Set('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC AS GU MP PR VI'.split(' '));
const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=900', ...extra }
});

export default async (request) => {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, { Allow: 'GET' });
  const u = new URL(request.url);
  const state = (u.searchParams.get('state') || '').trim().toUpperCase();
  const districtText = (u.searchParams.get('district') || '').trim();
  if (!STATES.has(state) || !/^(?:0|[1-9][0-9]?)$/.test(districtText) || Number(districtText) > 99) {
    return json({ error: 'Choose a valid state and district (0 for at-large).' }, 400);
  }
  const key = globalThis.Netlify?.env?.get?.('CONGRESS_API_KEY') || process.env.CONGRESS_API_KEY;
  if (!key) return json({ error: 'Congress.gov API key not configured. Add CONGRESS_API_KEY to Netlify environment variables and redeploy.' }, 503, { 'Cache-Control': 'no-store' });
  const endpoint = new URL(`https://api.congress.gov/v3/member/${state}/${Number(districtText)}`);
  endpoint.searchParams.set('api_key', key);
  endpoint.searchParams.set('format', 'json');
  endpoint.searchParams.set('currentMember', 'true');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8500);
  try {
    const response = await fetch(endpoint, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) return json({ error: 'Congress.gov is unavailable or returned an error.', upstreamStatus: response.status }, 502, { 'Cache-Control': 'no-store' });
    const data = await response.json();
    const members = Array.isArray(data.members) ? data.members : [];
    const current = members.filter(m => m.currentMember !== false && m.currentMember !== 'False' && m.currentMember !== 'false');
    // The API can include former representatives; display only entries identified as current.
    const result = current.map(m => ({
      bioguideId: String(m.bioguideId || ''),
      name: String(m.directOrderName || m.name || 'Name unavailable'),
      party: String(m.partyName || m.party || 'Not listed'),
      state: String(m.state || state),
      district: Number.isFinite(Number(m.district)) ? Number(m.district) : Number(districtText),
      congressUrl: m.bioguideId ? `https://www.congress.gov/member/${encodeURIComponent(m.bioguideId)}` : null
    }));
    return json({ demo: false, state, district: Number(districtText), members: result, retrievedAt: new Date().toISOString(), source: 'Congress.gov API', note: 'Current members, not 2028 candidates. Check district boundaries and official sources.' });
  } catch (error) {
    return json({ error: error?.name === 'AbortError' ? 'Congress.gov request timed out.' : 'Unable to contact Congress.gov.' }, 502, { 'Cache-Control': 'no-store' });
  } finally { clearTimeout(timer); }
};
