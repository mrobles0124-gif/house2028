
const $ = id => document.getElementById(id);

const STATES = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',
  CA:'California',CO:'Colorado',CT:'Connecticut',
  DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',
  ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',
  KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',
  MD:'Maryland',MA:'Massachusetts',MI:'Michigan',
  MN:'Minnesota',MS:'Mississippi',MO:'Missouri',
  MT:'Montana',NE:'Nebraska',NV:'Nevada',
  NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',
  NY:'New York',NC:'North Carolina',ND:'North Dakota',
  OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',
  RI:'Rhode Island',SC:'South Carolina',
  SD:'South Dakota',TN:'Tennessee',TX:'Texas',
  UT:'Utah',VT:'Vermont',VA:'Virginia',
  WA:'Washington',WV:'West Virginia',WI:'Wisconsin',
  WY:'Wyoming',DC:'District of Columbia',
  AS:'American Samoa',GU:'Guam',
  MP:'Northern Mariana Islands',PR:'Puerto Rico',
  VI:'U.S. Virgin Islands'
};

Object.entries(STATES)
  .sort((a,b) => a[1].localeCompare(b[1]))
  .forEach(([code,name]) => {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = name;
    $('state').append(option);
  });

$('state').value = 'CA';

let mode = 'live';
let demoData = null;

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function addOfficialLink(card, url, label) {
  if (!url) return;

  const link = element('a', '', label);
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  card.append(link);
}

function setMode(next) {
  mode = next;

  for (const m of ['live','demo']) {
    $(m).classList.toggle('active', m === mode);
    $(m).setAttribute('aria-pressed', String(m === mode));
  }

  $('sourceBadge').textContent =
    mode === 'demo' ? 'DEMO MODE' : 'LIVE MODE';

  $('status').textContent = mode === 'demo'
    ? 'Demo uses clearly fictional sample data.'
    : 'Live mode retrieves public government records.';

  $('result').replaceChildren();
  $('result').className = 'empty';
  $('result').textContent =
    'Choose a state and district, then run a lookup.';

  $('json').hidden = true;
  $('toggleJson').textContent = 'Show JSON ▾';
  $('toggleJson').setAttribute('aria-expanded', 'false');
}

$('live').addEventListener('click', () => setMode('live'));
$('demo').addEventListener('click', () => setMode('demo'));

$('toggleJson').addEventListener('click', () => {
  const hidden = !$('json').hidden;
  $('json').hidden = hidden;
  $('toggleJson').textContent =
    hidden ? 'Show JSON ▾' : 'Hide JSON ▴';
  $('toggleJson').setAttribute('aria-expanded', String(!hidden));
});

async function requestAPI(endpoint) {
  const response = await fetch(endpoint, {
    cache: 'no-store'
  });

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error('API returned an invalid response.');
  }

  if (!response.ok) {
    throw new Error(data.error || 'API request failed.');
  }

  return data;
}

function renderMembers(data, root) {
  const heading = element('h3', '', 'Current House member');
  root.append(heading);

  const members = data.members || [];

  if (!members.length) {
    root.append(element(
      'p',
      'micro',
      'No current member returned. Check vacancies and official records.'
    ));
    return;
  }

  for (const m of members) {
    const card = element('article', 'profile');

    card.append(
      element(
        'div',
        'eyebrow',
        data.demo
          ? 'FICTIONAL SAMPLE'
          : 'CURRENT HOUSE MEMBER'
      ),
      element('h3', '', m.name),
      element(
        'div',
        'meta',
        `${m.party} · ${m.state} · District ${m.district}`
      )
    );

    const retrieved = data.retrievedAt
      ? new Date(data.retrievedAt).toLocaleString()
      : 'Not available';

    card.append(element(
      'p',
      'micro',
      data.demo
        ? 'Illustrative data only.'
        : `Source: Congress.gov · Retrieved: ${retrieved}`
    ));

    if (!data.demo) {
      addOfficialLink(
        card,
        m.congressUrl,
        'View official Congress.gov record ↗'
      );
    }

    root.append(card);
  }
}


function describeCandidateStatus(code) {
  const statuses = {
    C: 'Statutory candidate',
    N: 'Not yet a statutory candidate',
    P: 'Prior statutory candidate',
    F: 'Future statutory candidate'
  };

  return statuses[String(code || '').toUpperCase()]
    || 'Status not specified';
}



function renderCandidates(data, root) {
  const year = data.electionYear || 'Selected';

  root.append(
    element('h3', '', `${year} FEC Candidate Records`)
  );

  const candidates = Array.isArray(data.candidates)
    ? data.candidates
    : [];

  if (!candidates.length) {
    root.append(element(
      'p',
      'micro',
      `No matching ${year} FEC candidate records were returned. ` +
      'This does not mean nobody is running.'
    ));
    return;
  }

  root.append(element(
    'p',
    'micro',
    `${candidates.length} candidate record(s) returned from the FEC.`
  ));

  const retrieved = data.retrievedAt
    ? new Date(data.retrievedAt).toLocaleString()
    : 'Not available';

  // Container for responsive candidate cards
  const grid = element('div', 'candidate-grid');

  for (const candidate of candidates) {
    const card = element('article', 'profile');

    card.append(
      element('div', 'eyebrow', 'FEC CANDIDATE RECORD'),
      element('h3', '', candidate.name || 'Name unavailable'),
      element(
        'div',
        'meta',
        `${candidate.party || 'Party not listed'} · ` +
        `${candidate.state} · District ${candidate.district}`
      )
    );

    const details = element('div', 'candidate-details');

    const statusCode = candidate.candidateStatus || '';

    details.append(
      element('p', 'micro', `Election cycle: ${year}`),
      element(
        'p',
        'micro',
        `FEC status: ${describeCandidateStatus(statusCode)} ` +
        `(Code: ${statusCode || 'Not listed'})`
      ),
      element(
        'p',
        'micro',
        `FEC Candidate ID: ${candidate.candidateId || 'Unavailable'}`
      ),
      element('p', 'micro', `Data retrieved: ${retrieved}`)
    );

    card.append(details);

    card.append(element(
      'p',
      'micro',
      'An FEC record does not confirm active campaigning ' +
      'or ballot qualification. Verify with official sources.'
    ));

    addOfficialLink(
      card,
      candidate.fecUrl,
      'View official FEC record ↗'
    );

    grid.append(card);
  }

  // Insert all candidate cards together
  root.append(grid);

  if (data.complete === false) {
    root.append(element(
      'p',
      'micro',
      'Additional FEC records may exist. ' +
      'The available results may be incomplete.'
    ));
  }
}



function renderDisclaimer(root) {
  const disclaimer = element(
    'p',
    'micro',
    'Disclaimer: House 2028 is for informational purposes ' +
    'only. It does not provide election advice, voting ' +
    'recommendations, or candidate endorsements. FEC records ' +
    'do not establish active campaigning or ballot qualification. ' +
    'Information may be incomplete or outdated. Verify with ' +
    'official election authorities. Not affiliated with any ' +
    'government agency or political campaign.'
  );

  root.append(disclaimer);
}

function showResult(memberData, candidateData, candidateError) {
  const root = $('result');
  root.className = '';
  root.replaceChildren();

  renderMembers(memberData, root);

  if (!memberData.demo) {
    if (candidateError) {
      root.append(element(
        'p',
        'micro',
        `FEC candidate records unavailable: ${candidateError}`
      ));
    } else if (candidateData) {
      renderCandidates(candidateData, root);
    }
  }

  renderDisclaimer(root);

  $('json').textContent = JSON.stringify({
    representative: memberData,
    fecCandidates: candidateData,
    fecError: candidateError
  }, null, 2);
}

$('lookup').addEventListener('click', async () => {
  const state = $('state').value;
  const district = $('district').value.trim();

  if (
    !/^(0|[1-9][0-9]?)$/.test(district) ||
    Number(district) > 99
  ) {
    $('status').textContent =
      'Enter a whole-number district from 0 to 99.';
    return;
  }

  const button = $('lookup');
  button.disabled = true;
  button.textContent = 'Loading…';

  $('status').textContent =
    mode === 'live'
      ? 'Retrieving congressional and FEC data…'
      : 'Loading fictional sample data…';

  try {
    if (mode === 'demo') {
      if (!demoData) {
        const response = await fetch('/data/members.json');

        if (!response.ok) {
          throw new Error('Demo data unavailable.');
        }

        demoData = await response.json();
      }

      const found = demoData.members.filter(m =>
        m.state === STATES[state] &&
        Number(m.district) === Number(district)
      );

      const data = {
        demo: true,
        state,
        district: Number(district),
        members: found,
        lastUpdated: demoData.lastUpdated,
        source: 'Fictional demonstration data'
      };

      $('sourceBadge').textContent = 'FICTIONAL DEMO';
      $('status').textContent =
        'Showing fictional demonstration records.';

      showResult(data, null, null);
    } else {
      const query = new URLSearchParams({
        state,
        district
      });

      const memberURL =
        `/.netlify/functions/representative?${query}`;

     

const candidateQuery = new URLSearchParams({
  state,
  district,
  year: $('electionYear').value
});

const candidateURL =
  `/.netlify/functions/candidates?${candidateQuery}`;


      // Both requests run concurrently.
      // A failure in one does not automatically cancel the other.
      const [memberResult, candidateResult] =
        await Promise.allSettled([
          requestAPI(memberURL),
          requestAPI(candidateURL)
        ]);

      if (memberResult.status === 'rejected') {
        throw memberResult.reason;
      }

      const memberData = memberResult.value;

      const candidateData =
        candidateResult.status === 'fulfilled'
          ? candidateResult.value
          : null;

      const candidateError =
        candidateResult.status === 'rejected'
          ? candidateResult.reason.message
          : null;

      $('sourceBadge').textContent =
        candidateError ? 'PARTIAL DATA' : 'GOVERNMENT DATA';

      $('status').textContent =
        `${memberData.members.length} current member(s) · ` +
        (candidateError
          ? 'FEC lookup unavailable.'
          : `${candidateData.candidates.length} FEC record(s) returned.`);

      showResult(
        memberData,
        candidateData,
        candidateError
      );
    }
  } catch (error) {
    $('sourceBadge').textContent = 'ERROR';
    $('status').textContent = error.message;

    $('result').className = 'empty';
    $('result').textContent =
      'Unable to retrieve representative data. ' +
      'Please try again later.';

    $('json').textContent = JSON.stringify({
      error: error.message
    }, null, 2);
  } finally {
    button.disabled = false;
    button.textContent = '↗ Look up member';
  }
});

// ZIP-code congressional district lookup
// Uses the existing HUD-powered Netlify function.

$('zipLookup').addEventListener('click', async () => {
  const input = $('zipCode').value.trim();
  const output = $('zipResults');
  const button = $('zipLookup');

  output.replaceChildren();

  // Accept ZIP5, ZIP+4, or nine digits without a hyphen.
  if (!/^\d{5}(?:-?\d{4})?$/.test(input)) {
    output.textContent =
      'Enter a valid ZIP code, such as 90620 or 90620-1234.';
    return;
  }

  // HUD mapping currently supports ZIP5, not ZIP+4.
  const zip = input.slice(0, 5);

  button.disabled = true;
  button.textContent = 'Finding districts…';

  try {
    const data = await requestAPI(
      `/.netlify/functions/district?zip=${encodeURIComponent(zip)}`
    );

    const districts = Array.isArray(data.districts)
      ? data.districts
      : [];

    if (input.length > 5) {
      output.append(element(
        'p',
        'hint',
        'ZIP+4 precision is not available yet. ' +
        'Results use the first five digits only.'
      ));
    }

    if (!districts.length) {
      output.append(element(
        'p',
        'hint',
        'No district mapping was returned for this ZIP code.'
      ));
      return;
    }

    output.append(element(
      'p',
      'micro',
      `${districts.length} possible congressional district(s) found.`
    ));

    for (const match of districts) {
      const state = match.state;
      const district = Number(match.district);

      if (
        !STATES[state] ||
        !Number.isInteger(district) ||
        district < 0 ||
        district > 99
      ) continue;

      const option = element(
        'button',
        'zip-district-option',
        `${STATES[state]} — District ${district}`
      );

      option.type = 'button';

      option.addEventListener('click', () => {
        $('state').value = state;
        $('district').value = String(district);

        $('status').textContent =
          `District ${district} selected. ` +
          'Press Look up member to view government records.';

        // Keep the selection explicit for ambiguous ZIP codes.
        // Do not automatically assume the highest ratio is correct.
      });

      output.append(option);

      if (Number.isFinite(Number(match.residentialRatio))) {
        output.append(element(
          'p',
          'hint',
          `${(Number(match.residentialRatio) * 100).toFixed(2)}% ` +
          'of residential addresses in this ZIP code'
        ));
      }
    }

    if (data.ambiguous) {
      output.append(element(
        'p',
        'hint',
        'This ZIP code overlaps multiple districts. ' +
        'Select the district that matches your address. ' +
        'Use an official address-based lookup if unsure.'
      ));
    }

  } catch (error) {
    output.append(element(
      'p',
      'hint',
      `ZIP lookup unavailable: ${error.message}`
    ));
  } finally {
    button.disabled = false;
    button.textContent = 'Find districts by ZIP';
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () =>
    navigator.serviceWorker.register('/sw.js')
      .catch(console.warn)
  );
}
