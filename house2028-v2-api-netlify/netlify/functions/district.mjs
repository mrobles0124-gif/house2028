
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
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

  return json({
    success: true,
    zip,
    status: 'ready',
    districts: [],
    source: null,
    note: 'ZIP-code lookup endpoint is operational. ' +
      'District mapping has not yet been connected. ' +
      'Some ZIP codes overlap multiple congressional districts.'
  });
};
