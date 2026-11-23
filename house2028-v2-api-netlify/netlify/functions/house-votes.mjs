
const json = (body, status = 200, cacheable = true) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control':
        status === 200 && cacheable
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

  const congress = 119;
  const session = 2;

  const pageSize = 8;
  const maxConcurrentChecks = 3;

  // Each upstream request has its own timeout.
  const listTimeoutMs = 9000;
  const memberTimeoutMs = 6500;

  const offset = Number(
    url.searchParams.get('offset') || 0
  );

  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > 10000 ||
    offset % pageSize !== 0
  ) {
    return json({
      error: 'Invalid voting-history offset.'
    }, 400);
  }

  const getCongressData = async (
    path,
    params = {},
    timeoutMs = memberTimeoutMs
  ) => {
    const endpoint = new URL(
      `https://api.congress.gov/v3/${path}`
    );

    endpoint.searchParams.set('api_key', key);
    endpoint.searchParams.set('format', 'json');

    for (const [name, value] of Object.entries(params)) {
      endpoint.searchParams.set(name, String(value));
    }

    const response = await fetch(endpoint, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(
        `Congress.gov returned HTTP ${response.status}.`
      );
    }

    return response.json();
  };

  try {
    // Step 1: Retrieve one page of House roll calls.
    const listData = await getCongressData(
      `house-vote/${congress}/${session}`,
      {
        limit: pageSize,
        offset
      },
      listTimeoutMs
    );

    if (!Array.isArray(listData.houseRollCallVotes)) {
      throw new Error(
        'Unexpected House roll-call listing format.'
      );
    }

    const selectedVotes = [
      ...listData.houseRollCallVotes
    ].sort(
      (a, b) =>
        Number(b.rollCallNumber) -
        Number(a.rollCallNumber)
    );

    const votes = [];
    const failedRollCalls = [];
    const skippedRollCalls = [];

    // Step 2: Retrieve one member's recorded position.
    const checkVote = async (vote) => {
      const rollCallNumber = Number(
        vote.rollCallNumber
      );

      if (
        !Number.isInteger(rollCallNumber) ||
        rollCallNumber < 1
      ) {
        return {
          status: 'invalid',
          rollCallNumber: vote.rollCallNumber ?? null
        };
      }

      try {
        const details = await getCongressData(
          `house-vote/${congress}/${session}/${rollCallNumber}/members`,
          { limit: 500 }
        );

        const record =
          details.houseRollCallVoteMemberVotes;

        if (
          !record ||
          !Array.isArray(record.results) ||
          record.results.length === 0
        ) {
          throw new Error(
            'Missing or empty member-vote results.'
          );
        }

        const memberVote = record.results.find(
          member =>
            String(
              member.bioguideID ||
              member.bioguideId ||
              ''
            ).toUpperCase() === bioguideId
        );

        if (!memberVote) {
          return {
            status: 'not-found',
            rollCallNumber
          };
        }

        return {
          status: 'found',
          vote: {
            congress,
            session,
            rollCallNumber,
            date:
              record.startDate ||
              vote.startDate ||
              null,
            position: String(
              memberVote.voteCast ||
              'Not specified'
            ),
            question: String(
              record.voteQuestion ||
              'Not specified'
            ),
            result: String(
              record.result ||
              vote.result ||
              'Not specified'
            ),
            legislationType:
              record.legislationType ||
              vote.legislationType ||
              null,
            legislationNumber:
              record.legislationNumber ||
              vote.legislationNumber ||
              null,
            sourceUrl:
              record.sourceDataURL ||
              vote.sourceDataURL ||
              `https://clerk.house.gov/Votes/${rollCallNumber}2026`
          }
        };

      } catch (error) {
        console.warn(
          'CivicAtlas roll-call request failed:',
          rollCallNumber,
          error?.message || 'Unknown error'
        );

        return {
          status: 'failed',
          rollCallNumber
        };
      }
    };

    // Step 3: Process up to three requests at once.
    // A failed request does not discard successful ones.
    for (
      let index = 0;
      index < selectedVotes.length;
      index += maxConcurrentChecks
    ) {
      const batch = selectedVotes.slice(
        index,
        index + maxConcurrentChecks
      );

      const results = await Promise.all(
        batch.map(checkVote)
      );

      for (const result of results) {
        if (result.status === 'found') {
          votes.push(result.vote);
        } else if (result.status === 'failed') {
          failedRollCalls.push(
            result.rollCallNumber
          );
        } else if (result.status === 'invalid') {
          skippedRollCalls.push(
            result.rollCallNumber
          );
        }
      }
    }

    // Keep the returned records ordered within this page.
    votes.sort(
      (a, b) =>
        b.rollCallNumber - a.rollCallNumber
    );

    const partial =
      failedRollCalls.length > 0 ||
      skippedRollCalls.length > 0;

    const hasMore = Boolean(
      listData.pagination?.next
    );

    const nextOffset = hasMore
      ? offset + selectedVotes.length
      : null;

    // Don't cache incomplete pages.
    return json({
      success: true,
      bioguideId,
      congress,
      session,
      votes,
      count: votes.length,
      checked: selectedVotes.length,
      failedChecks: failedRollCalls.length,
      failedRollCalls,
      skippedRollCalls,
      partial,
      complete: false,
      pagination: {
        offset,
        pageSize,
        nextOffset,
        hasMore
      },
      retrievedAt: new Date().toISOString(),
      source:
        'Congress.gov House Roll Call Vote API',
      note: partial
        ? 'Some roll calls could not be retrieved. ' +
          'This page is incomplete and should not ' +
          'be treated as a complete voting record.'
        : 'Limited sample of House roll calls. ' +
          'This is not a complete voting history ' +
          'or voting score. A missing member vote ' +
          'does not establish absence or nonparticipation.'
    }, 200, !partial);

  } catch (error) {
    console.error(
      'CivicAtlas voting-page request failed:',
      error?.message || 'Unknown error'
    );

    return json({
      success: false,
      error:
        error?.name === 'TimeoutError' ||
        error?.name === 'AbortError'
          ? 'Voting-record lookup timed out.'
          : 'Unable to retrieve voting records.',
      detail: error?.message || null
    }, 502);
  }
};
