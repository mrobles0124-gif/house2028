
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': status === 200
        ? 'public, max-age=0, s-maxage=300'
        : 'no-store'
    }
  });

export default async (request) => {
  if (request.method !== 'GET') {
    return json({ error: 'Method not allowed.' }, 405);
  }

  const url = new URL(request.url);
  const bioguideId = (
    url.searchParams.get('bioguideId') || ''
  ).trim().toUpperCase();

  if (!/^[A-Z][0-9]{6}$/.test(bioguideId)) {
    return json({
      error: 'Enter a valid congressional BioGuide ID.'
    }, 400);
  }

  const key =
    globalThis.Netlify?.env?.get?.('CONGRESS_API_KEY') ||
    process.env.CONGRESS_API_KEY;

  if (!key) {
    return json({
      error: 'Congress.gov API key is not configured.'
    }, 503);
  }

  // 119th Congress, second session (2026).
  // This first release examines a bounded set of votes.
  const congress = 119;
  const session = 2;
  
const maxVotesToCheck = 8;
const maxConcurrentChecks = 3;


  const controller = new AbortController();
  
const timer = setTimeout(() => controller.abort(), 25000);


  const getCongressData = async (path, params = {}) => {
    const endpoint = new URL(
      `https://api.congress.gov/v3/${path}`
    );

    endpoint.searchParams.set('api_key', key);
    endpoint.searchParams.set('format', 'json');

    for (const [name, value] of Object.entries(params)) {
      endpoint.searchParams.set(name, String(value));
    }

    const response = await fetch(endpoint, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) {
      throw new Error(
        `Congress.gov returned HTTP ${response.status}.`
      );
    }

    return response.json();
  };

  try {
    // Request a page of recent roll calls.
    const listData = await getCongressData(
      `house-vote/${congress}/${session}`,
      { limit: 20 }
    );

    const listedVotes = Array.isArray(
      listData.houseRollCallVotes
    ) ? listData.houseRollCallVotes : [];

    // Explicitly sort newest first by roll-call number.
    const selectedVotes = [...listedVotes]
      .sort((a, b) =>
        Number(b.rollCallNumber) -
        Number(a.rollCallNumber)
      )
      .slice(0, maxVotesToCheck);

    const votes = [];
    let failedChecks = 0;


// PASTE THE NEW checkVote FUNCTION HERE

// PASTE THE NEW CONCURRENT BATCH LOOP HERE

return json({
  success: true,
  bioguideId,
  congress,
  session,
  votes,
  // ... rest of your existing response
});
    return json({
      success: true,
      bioguideId,
      congress,
      session,
      votes,
      count: votes.length,
      checked: selectedVotes.length,
      failedChecks,
      complete: false,
      retrievedAt: new Date().toISOString(),
      source: 'Congress.gov House Roll Call Vote API',
      note:
        'Limited sample of legislation-related roll calls ' +
        'from the API page returned. This is not a complete ' +
        'voting history or a voting score. A missing vote ' +
        'does not establish absence or nonparticipation.'
    });

  } catch (error) {
    return json({
      error: error?.name === 'AbortError'
        ? 'Voting-record lookup timed out.'
        : 'Unable to retrieve voting records.',
      detail: error?.message || null
    }, 502);

  } finally {
    clearTimeout(timer);
  }
};
