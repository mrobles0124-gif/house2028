
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

let latestLookupId = 0;

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

// CIVICATLAS — POLITICIAN PROFILE OVERLAY

let activeProfile = null;

function openProfile(person, office, votes = null, demo = false) {
  activeProfile = { person, office, votes, demo };

  $('profileName').textContent =
    person.name || 'Name unavailable';

  $('profileOffice').textContent =
    `${person.party || 'Party not listed'} · ` +
    `${person.state || 'Location unavailable'} · ` +
    (office === 'house'
      ? `U.S. House — District ${person.district}`
      : 'U.S. Senate');

  selectProfileTab('votes');

  $('profileDialog').showModal();
}

function selectProfileTab(tab) {
  if (!activeProfile) return;

  const tabs = {
    votes: $('tabVotes'),
    funding: $('tabFunding'),
    disclosures: $('tabDisclosures')
  };

  for (const [key, button] of Object.entries(tabs)) {
    const selected = key === tab;

    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
  }

  const content = $('profileContent');
  content.replaceChildren();
  content.setAttribute('aria-labelledby', tabs[tab].id);

  if (tab === 'votes') {
    if (activeProfile.demo) {
      content.append(element(
        'p', 'micro',
        'Fictional demonstration profile. ' +
        'No real voting records are associated with this person.'
      ));
    } else if (
      activeProfile.office === 'house' &&
      activeProfile.votes
    ) {
      renderHouseVotes(activeProfile.votes, content);
    } else if (activeProfile.office === 'senate') {
      content.append(
        element('h3', '', 'Senate Voting History'),
        element('p', 'micro',
          'Senate voting records are not connected yet. ' +
          'This does not indicate an absence of recorded votes.')
      );
    } else {
      content.append(element(
        'p', 'micro',
        'House voting records are currently unavailable. ' +
        'This does not indicate an absence of recorded votes.'
      ));
    }
  }

  if (tab === 'funding') {
    content.append(
      element('h3', '', 'Campaign Funding'),
      element('p', 'micro',
        'Campaign finance data is not connected yet. ' +
        'Future records will identify election cycles, ' +
        'committees, contributions, and independent expenditures.')
    );
  }

  if (tab === 'disclosures') {
    content.append(
      element('h3', '', 'Financial Disclosures'),
      element('p', 'micro',
        'Financial disclosure records are not connected yet. ' +
        'Future profiles will show reported assets and liabilities ' +
        'using the ranges provided in official filings, ' +
        'rather than claiming an exact net worth.')
    );
  }
}

// Close button
$('closeProfile').addEventListener('click', () => {
  $('profileDialog').close();
});

// Tab buttons
$('tabVotes').addEventListener('click', () => {
  selectProfileTab('votes');
});

$('tabFunding').addEventListener('click', () => {
  selectProfileTab('funding');
});

$('tabDisclosures').addEventListener('click', () => {
  selectProfileTab('disclosures');
});

// Keyboard navigation between tabs
const profileTabButtons = [
  $('tabVotes'),
  $('tabFunding'),
  $('tabDisclosures')
];

profileTabButtons.forEach((button, index) => {
  button.addEventListener('keydown', event => {
    let nextIndex;

    if (event.key === 'ArrowRight') {
      nextIndex = (index + 1) % profileTabButtons.length;
    } else if (event.key === 'ArrowLeft') {
      nextIndex =
        (index - 1 + profileTabButtons.length) %
        profileTabButtons.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = profileTabButtons.length - 1;
    } else {
      return;
    }

    event.preventDefault();

    const nextTab = profileTabButtons[nextIndex];
    nextTab.focus();

    const tabNames = ['votes', 'funding', 'disclosures'];
    selectProfileTab(tabNames[nextIndex]);
  });
});

// Clear profile state after closing
$('profileDialog').addEventListener('close', () => {
  activeProfile = null;
});
function setMode(next) {
  // Invalidate any lookup still running.
  latestLookupId++;

  // Reset the lookup button if a request was in progress.
  const lookupButton = $('lookup');
  lookupButton.disabled = false;
  lookupButton.removeAttribute('aria-busy');
  lookupButton.textContent = '↗ Look up member';

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

function renderMembers(data, root, voteData = null) {
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
    const profileButton = element(
      'button',
      'view-profile',
      'View full profile →'
    );

    profileButton.type = 'button';

    profileButton.addEventListener('click', () => {
      openProfile(m, 'house', voteData, Boolean(data.demo));
    });

    card.append(profileButton);
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

function renderHouseVotes(data, root) {
  root.append(
    element('h3', '', 'Recent House Voting Records')
  );

  const votes = Array.isArray(data.votes)
    ? data.votes
    : [];

  if (!votes.length) {
    root.append(element(
      'p',
      'micro',
      'No matching votes were found in this limited sample. ' +
      'This does not mean the representative did not vote.'
    ));
    return;
  }

  const grid = element('div', 'candidate-grid');

  for (const vote of votes) {
    const card = element('article', 'profile');

    const position = String(
      vote.position || 'Not specified'
    );

    card.append(
      element(
        'div',
        'eyebrow',
        `HOUSE ROLL CALL ${vote.rollCallNumber}`
      ),
      element('h3', '', `Recorded vote: ${position}`)
    );

    if (vote.date) {
      const date = new Date(vote.date);

      if (!Number.isNaN(date.getTime())) {
        card.append(element(
          'p',
          'micro',
          `Date: ${date.toLocaleDateString()}`
        ));
      }
    }

    card.append(
      element(
        'p',
        'meta',
        `Motion: ${vote.question || 'Not specified'}`
      ),
      element(
        'p',
        'micro',
        `Overall result: ${vote.result || 'Not specified'}`
      )
    );

    if (vote.legislationType && vote.legislationNumber) {
      card.append(element(
        'p',
        'micro',
        `Legislation: ${vote.legislationType} ${vote.legislationNumber}`
      ));
    }

    addOfficialLink(
      card,
      vote.sourceUrl,
      'View official roll-call record ↗'
    );
    const profileButton = element(
      'button',
      'view-profile',
      'View full profile →'
    );

    profileButton.type = 'button';

    profileButton.addEventListener('click', () => {
      openProfile(senator, 'senate');
    });

    card.append(profileButton);
    grid.append(card);
  }

  root.append(grid);

  root.append(element(
    'p',
    'micro',
    `Limited sample: ${data.checked || 0} roll calls checked. ` +
    'Not a complete voting history or a voting score. ' +
    'A motion vote is not necessarily a final-passage vote.'
  ));

  if (data.failedChecks > 0) {
    root.append(element(
      'p',
      'micro',
      `${data.failedChecks} roll-call check(s) could not be completed.`
    ));
  }
}


function renderSenators(data, root) {
  root.append(
    element('h3', '', 'Your U.S. Senators')
  );

  const senators = Array.isArray(data.senators)
    ? data.senators
    : [];

  if (!senators.length) {
    root.append(element(
      'p',
      'micro',
      'No current Senate records were returned. ' +
      'Check official sources for vacancies or updates.'
    ));
    return;
  }

  const grid = element('div', 'candidate-grid');

  for (const senator of senators) {
    const card = element('article', 'profile');

    card.append(
      element('div', 'eyebrow', 'CURRENT U.S. SENATOR'),
      element('h3', '', senator.name),
      element(
        'div',
        'meta',
        `${senator.party} · ${senator.state} · U.S. Senate`
      )
    );

    addOfficialLink(
      card,
      senator.congressUrl,
      'View official Congress.gov record ↗'
    );

    grid.append(card);
  }

  root.append(grid);
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

function showResult(
  memberData,
  candidateData,
  candidateError,
  senateData = null,
  senateError = null,
  voteData = null,
  voteError = null
) {
  const root = $('result');
  root.className = '';
  root.replaceChildren();

  renderMembers(memberData, root, voteData);


if (senateData) {
  renderSenators(senateData, root);
} else if (senateError) {
  root.append(element(
    'p',
    'micro',
    `Senate records unavailable: ${senateError}`
  ));
}

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
  houseVotes: voteData,
  houseVotesError: voteError,
  senators: senateData,
  senateError: senateError,
  fecCandidates: candidateData,
  fecError: candidateError
}, null, 2);

}


$('lookup').addEventListener('click', async () => {
  const lookupId = ++latestLookupId;

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
  button.textContent = 'Loading…';
  button.setAttribute('aria-busy', 'true');


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
      if (lookupId !== latestLookupId) return;
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

const senateURL =
  `/.netlify/functions/senators?state=${encodeURIComponent(state)}`;
      // Both requests run concurrently.
      // A failure in one does not automatically cancel the other.
     
const [memberResult, candidateResult, senateResult] =
  await Promise.allSettled([
    requestAPI(memberURL),
    requestAPI(candidateURL),
    requestAPI(senateURL)
  ]);

 if (lookupId !== latestLookupId) return;
      if (memberResult.status === 'rejected') {
        throw memberResult.reason;
      }

      const memberData = memberResult.value;

// Voting records require the representative's BioGuide ID.
const bioguideId = memberData.members?.[0]?.bioguideId;

let voteData = null;
let voteError = null;

if (bioguideId) {
  try {
    voteData = await requestAPI(
      `/.netlify/functions/house-votes?bioguideId=${encodeURIComponent(bioguideId)}`
    );
  } catch (error) {
    voteError = error.message;
  }
} else {
  voteError = 'No current House member BioGuide ID available.';
}

// Prevent an older lookup from displaying results.
if (lookupId !== latestLookupId) return;

      const candidateData =
        candidateResult.status === 'fulfilled'
          ? candidateResult.value
          : null;

      const candidateError =
        candidateResult.status === 'rejected'
          ? candidateResult.reason.message
          : null;
const senateData =
  senateResult.status === 'fulfilled'
    ? senateResult.value
    : null;

const senateError =
  senateResult.status === 'rejected'
    ? senateResult.reason.message
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
  candidateError,
  senateData,
  senateError,
  voteData,
  voteError
);

    }
 
  } catch (error) {
    if (lookupId !== latestLookupId) return;

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
    if (lookupId === latestLookupId) {
         button.removeAttribute('aria-busy');
      button.textContent = '↗ Look up member';
    }
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
  // Update the manual search fields.
  $('state').value = state;
  $('district').value = String(district);

  // Remove the highlight from other district buttons.
  output.querySelectorAll('.zip-district-option')
    .forEach(button => {
      button.classList.remove('zip-district-selected');
      button.setAttribute('aria-pressed', 'false');
    });

  // Highlight the selected district.
  option.classList.add('zip-district-selected');
  option.setAttribute('aria-pressed', 'true');

  // Show a confirmation below the district options.
  let confirmation = output.querySelector(
    '.zip-selection-confirmation'
  );

  if (!confirmation) {
    confirmation = element(
      'p',
      'zip-selection-confirmation'
    );
    output.append(confirmation);
  }

  confirmation.textContent =
    `✓ Selected: ${STATES[state]} — District ${district}`;

  
$('status').textContent =
  `District ${district} selected. ` +
  'Loading representative and candidate records…';

// Automatically retrieve the representative and FEC records.
$('lookup').click();

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

/* Street-address congressional district lookup */

$('addressLookup').addEventListener('click', async () => {
  const address = $('streetAddress').value.trim();
  const output = $('addressResults');
  const button = $('addressLookup');

  output.replaceChildren();

 if (
  address.length < 10 ||
  address.length > 250 ||
  !/^\d/.test(address)
) {
    output.textContent =
      'Please enter a complete street address, city, state, and ZIP code.';
    return;
  }

  if (mode === 'demo') {
    output.textContent =
      'Address lookup requires Live API mode.';
    return;
  }

  button.disabled = true;
  button.textContent = 'Finding district…';

  try {
    const query = new URLSearchParams({ address });

    const data = await requestAPI(
      `/.netlify/functions/address?${query}`
    );

    const districts = Array.isArray(data.districts)
      ? data.districts
      : [];

    if (data.success !== true ||
        data.status !== 'matched' ||
        districts.length !== 1) {
      output.textContent =
        'A unique district could not be determined. ' +
        'Please verify the address or use manual lookup.';
      return;
    }

    const match = districts[0];
    const state = String(match.state || '').toUpperCase();
    const district = Number(match.district);

    if (
      !STATES[state] ||
      !Number.isInteger(district) ||
      district < 0 ||
      district > 99
    ) {
      throw new Error('Invalid district data returned.');
    }

    // Populate existing manual search fields.
    $('state').value = state;
    $('district').value = String(district);

    const confirmation = element(
      'div',
      'address-selection-confirmation'
    );

    confirmation.append(
      element('strong', '',
        `✓ ${STATES[state]} — District ${district}`),
      element('p', 'hint',
        'District identified using Census address geocoding. ' +
        'Results may be approximate. Verify with official sources.')
    );

    output.append(confirmation);

    
$('status').textContent =
  `${STATES[state]} District ${district} identified. ` +
  'Loading representative and candidate records…';

// Automatically run the existing member lookup.
$('lookup').click();


  } catch (error) {
    output.textContent =
      `Address lookup unavailable: ${error.message}`;
  } finally {
    button.disabled = false;
    button.textContent = 'Find district by address';
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () =>
    navigator.serviceWorker.register('/sw.js')
      .catch(console.warn)
  );
}
