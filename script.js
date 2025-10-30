const appData = {
  providers: {},
  cpus: {},
  defaultPue: {},
  carbonByZone: {},
  carbonByName: {},
  memPowerDefault: 0.3725,
  fallbackCI: 400,
};

const TREE_CO2_ABSORPTION_KG_PER_YEAR = 21.77; // Approximate CO₂ absorption per tree per year

const SAVED_RUNS_STORAGE_KEY = 'gf_saved_runs_v1';
const MAX_SAVED_RUNS = 12;
let savedRuns = [];
let lastResult = null;
let dataReady = false;
let saveConfirmationTimeout;
let lastPointerPosition = { x: 0.5, y: 0.5 };

const reducedMotionQuery = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

function prefersReducedMotion() {
  return reducedMotionQuery?.matches ?? false;
}

const AWS_FALLBACK_REGIONS = [
  { regionName: 'US East (N. Virginia)', location: 'US-VA', locationFree: 'Northern Virginia, USA' },
  { regionName: 'US East (Ohio)', location: 'US-OH', locationFree: 'Ohio, USA' },
  { regionName: 'US West (N. California)', location: 'US-CA', locationFree: 'Northern California, USA' },
  { regionName: 'US West (Oregon)', location: 'US-OR', locationFree: 'Oregon, USA' },
  { regionName: 'Canada (Central)', location: 'CA-QC', locationFree: 'Montreal, Canada' },
  { regionName: 'Canada West (Calgary)', location: 'CA-AB', locationFree: 'Calgary, Canada' },
  { regionName: 'South America (Sao Paulo)', location: 'BR', locationFree: 'Sao Paulo, Brazil' },
  { regionName: 'Europe (Ireland)', location: 'IE', locationFree: 'Dublin, Ireland' },
  { regionName: 'Europe (London)', location: 'GB', locationFree: 'London, United Kingdom' },
  { regionName: 'Europe (Paris)', location: 'FR', locationFree: 'Paris, France' },
  { regionName: 'Europe (Frankfurt)', location: 'DE', locationFree: 'Frankfurt, Germany' },
  { regionName: 'Europe (Zurich)', location: 'CH', locationFree: 'Zurich, Switzerland' },
  { regionName: 'Europe (Spain)', location: 'ES', locationFree: 'Spain' },
  { regionName: 'Europe (Milan)', location: 'IT', locationFree: 'Milan, Italy' },
  { regionName: 'Europe (Stockholm)', location: 'SE', locationFree: 'Stockholm, Sweden' },
  { regionName: 'Europe (Warsaw)', location: 'PL', locationFree: 'Warsaw, Poland' },
  { regionName: 'Asia Pacific (Mumbai)', location: 'IN', locationFree: 'Mumbai, India' },
  { regionName: 'Asia Pacific (Hyderabad)', location: 'IN', locationFree: 'Hyderabad, India' },
  { regionName: 'Asia Pacific (Singapore)', location: 'SG', locationFree: 'Singapore' },
  { regionName: 'Asia Pacific (Sydney)', location: 'AU-NSW', locationFree: 'Sydney, Australia' },
  { regionName: 'Asia Pacific (Melbourne)', location: 'AU-VIC', locationFree: 'Melbourne, Australia' },
  { regionName: 'Asia Pacific (Jakarta)', location: 'ID', locationFree: 'Jakarta, Indonesia' },
  { regionName: 'Asia Pacific (Tokyo)', location: 'JP', locationFree: 'Tokyo, Japan' },
  { regionName: 'Asia Pacific (Osaka)', location: 'JP', locationFree: 'Osaka, Japan' },
  { regionName: 'Asia Pacific (Seoul)', location: 'KR', locationFree: 'Seoul, South Korea' },
  { regionName: 'Asia Pacific (Hong Kong)', location: 'CN-HK', locationFree: 'Hong Kong' },
  { regionName: 'China (Beijing)', location: 'CN', locationFree: 'Beijing, China' },
  { regionName: 'China (Ningxia)', location: 'CN', locationFree: 'Ningxia, China' },
  { regionName: 'Middle East (UAE)', location: 'AE', locationFree: 'Dubai, United Arab Emirates' },
  { regionName: 'Middle East (Tel Aviv)', location: 'IL', locationFree: 'Tel Aviv, Israel' },
  { regionName: 'Africa (Cape Town)', location: 'ZA', locationFree: 'Cape Town, South Africa' },
];

function resetTreeImpact(message = 'Run a calculation to compare regions for the selected provider.') {
  const tableContainer = document.getElementById('treeImpactTable');
  const hint = document.getElementById('treeImpactHint');
  if (tableContainer) {
    tableContainer.innerHTML = '';
  }
  if (hint) {
    hint.textContent = message;
  }
}

function setResultsComputedState(isComputed) {
  const results = document.querySelector('.results');
  if (!results) return;
  if (!isComputed) {
    results.classList.remove('results--computed');
    return;
  }
  results.classList.remove('results--computed');
  // Force reflow to allow animation retrigger
  void results.offsetWidth;
  results.classList.add('results--computed');
}

function updateSplitFlap(track, newValue) {
  if (!track) return;
  const value = newValue ?? '';
  const digits = value.split('');
  const reduceMotion = prefersReducedMotion();
  const existingCells = Array.from(track.querySelectorAll('.split-flap__cell'));

  while (existingCells.length < digits.length) {
    const cell = createSplitFlapCell();
    track.appendChild(cell);
    existingCells.push(cell);
  }

  while (existingCells.length > digits.length) {
    const cell = existingCells.pop();
    clearSplitFlapTimers(cell);
    cell.remove();
  }

  existingCells.forEach((cell, index) => {
    const char = digits[index] ?? '.';
    prepareSplitFlapCell(cell, char);
    if (char === '.') {
      setSplitFlapImmediate(cell, '.');
    } else {
      animateSplitFlapCell(cell, char, reduceMotion);
    }
  });

  track.dataset.value = value;
}

function clearSplitFlapTimers(cell) {
  if (cell._splitFlapTimers) {
    cell._splitFlapTimers.forEach((timerId) => clearTimeout(timerId));
  }
  cell._splitFlapTimers = [];
}

function createSplitFlapCell() {
  const cell = document.createElement('span');
  cell.className = 'split-flap__cell';

  const card = document.createElement('span');
  card.className = 'split-flap__card';

  const topHalf = document.createElement('span');
  topHalf.className = 'split-flap__half split-flap__half--top';
  topHalf.dataset.char = '0';

  const hinge = document.createElement('span');
  hinge.className = 'split-flap__hinge';

  const bottomHalf = document.createElement('span');
  bottomHalf.className = 'split-flap__half split-flap__half--bottom';
  bottomHalf.dataset.char = '0';

  const shadow = document.createElement('span');
  shadow.className = 'split-flap__shadow';

  card.appendChild(topHalf);
  card.appendChild(hinge);
  card.appendChild(bottomHalf);
  card.appendChild(shadow);
  cell.appendChild(card);
  cell.dataset.currentChar = '0';
  return cell;
}

function prepareSplitFlapCell(cell, char) {
  cell.classList.remove('split-flap__cell--narrow', 'split-flap__cell--blank');
  if (char === '.') {
    cell.classList.add('split-flap__cell--narrow');
  }
}

function setSplitFlapImmediate(cell, char) {
  clearSplitFlapTimers(cell);
  const topHalf = cell.querySelector('.split-flap__half--top');
  const bottomHalf = cell.querySelector('.split-flap__half--bottom');
  topHalf.dataset.char = char;
  bottomHalf.dataset.char = char;
  cell.dataset.currentChar = char;
  cell.classList.remove('split-flap__cell--animate');
}

function animateSplitFlapCell(cell, targetChar, reduceMotion) {
  if (reduceMotion) {
    setSplitFlapImmediate(cell, targetChar);
    return;
  }

  const digits = '0123456789';
  const cycles = 2 + Math.floor(Math.random() * 3);
  const sequence = [];
  let previousChar = cell.dataset.currentChar ?? '0';
  for (let i = 0; i < cycles; i += 1) {
    let randomChar = digits[Math.floor(Math.random() * digits.length)];
    const attempts = digits.length;
    let attempt = 0;
    while ((randomChar === targetChar || randomChar === previousChar) && attempt < attempts) {
      randomChar = digits[(digits.indexOf(randomChar) + 1) % digits.length];
      attempt += 1;
    }
    sequence.push(randomChar);
    previousChar = randomChar;
  }
  sequence.push(targetChar);

  clearSplitFlapTimers(cell);
  const timers = [];
  /* start with a smaller random offset and use a shorter per-step increment so
     the sequence runs noticeably faster while still allowing animations to
     complete */
  let delay = Math.random() * 80;

  sequence.forEach((char) => {
    const timer = setTimeout(() => {
      performSplitFlapFlip(cell, char);
    }, delay);
    timers.push(timer);
    /* shorter step: ~300-420ms instead of ~560-760ms */
    delay += 300 + Math.random() * 120;
  });

  cell._splitFlapTimers = timers;
}

function performSplitFlapFlip(cell, nextChar) {
  const topHalf = cell.querySelector('.split-flap__half--top');
  const bottomHalf = cell.querySelector('.split-flap__half--bottom');
  const currentChar = cell.dataset.currentChar ?? bottomHalf.dataset.char ?? topHalf.dataset.char ?? '0';

  if (currentChar === nextChar) {
    setSplitFlapImmediate(cell, nextChar);
    return;
  }

  const handleTopAnimation = (event) => {
    if (event.animationName !== 'split-flap-top') return;
    bottomHalf.dataset.char = nextChar;
    topHalf.removeEventListener('animationend', handleTopAnimation);
  };

  const handleBottomAnimation = (event) => {
    if (event.animationName !== 'split-flap-bottom') return;
    topHalf.dataset.char = nextChar;
    bottomHalf.dataset.char = nextChar;
    cell.dataset.currentChar = nextChar;
    cell.classList.remove('split-flap__cell--animate');
    bottomHalf.removeEventListener('animationend', handleBottomAnimation);
  };

  topHalf.dataset.char = currentChar;
  bottomHalf.dataset.char = currentChar;
  cell.classList.remove('split-flap__cell--animate');
  void cell.offsetWidth;
  topHalf.addEventListener('animationend', handleTopAnimation);
  bottomHalf.addEventListener('animationend', handleBottomAnimation);
  cell.classList.add('split-flap__cell--animate');
}

function updateResultOutput(carbonKg, totalTrialCount, totalHours) {
  const output = document.getElementById('output');
  if (!output) return;

  let figure = output.querySelector('.results__figure');
  let details = output.querySelector('.results__details');

  if (!figure) {
    figure = document.createElement('div');
    figure.className = 'results__figure split-flap';
    output.innerHTML = '';
    output.appendChild(figure);
  }

  figure.classList.add('split-flap');

  let digitsGroup = figure.querySelector('.split-flap__digits');
  let track = figure.querySelector('.split-flap__track');
  let sr = figure.querySelector('.split-flap__sr');
  let unit = figure.querySelector('.split-flap__unit');

  if (!digitsGroup || !track || !sr || !unit) {
    figure.innerHTML = '';
    digitsGroup = document.createElement('span');
    digitsGroup.className = 'split-flap__digits';
    sr = document.createElement('span');
    sr.className = 'sr-only split-flap__sr';
    track = document.createElement('span');
    track.className = 'split-flap__track';
    unit = document.createElement('span');
    unit.className = 'split-flap__unit';

    digitsGroup.appendChild(sr);
    digitsGroup.appendChild(track);
    figure.appendChild(digitsGroup);
    figure.appendChild(unit);
  }

  figure.setAttribute('role', 'text');
  figure.setAttribute('aria-live', 'polite');

  track.setAttribute('aria-hidden', 'true');
  unit.setAttribute('aria-hidden', 'true');

  if (!details) {
    details = document.createElement('p');
    details.className = 'results__details';
    output.appendChild(details);
  }

  const numericText = carbonKg.toFixed(2);
  updateSplitFlap(track, numericText);

  sr.textContent = `${numericText} kilograms of CO₂ equivalent`;
  unit.textContent = 'kg CO₂e';
  figure.dataset.value = numericText;

  details.textContent = `Total trials: ${totalTrialCount} • Total machine-hours: ${totalHours.toFixed(2)} h`;
}

function toggleResultActions(isActive) {
  const ids = ['saveResultButton', 'downloadResultButton'];
  ids.forEach((id) => {
    const button = document.getElementById(id);
    if (!button) return;
    if (isActive) {
      button.hidden = false;
      button.disabled = false;
    } else {
      button.hidden = true;
    }
  });
}

function setBackgroundCursor(x, y) {
  const clampedX = Math.min(Math.max(x, 0), 1);
  const clampedY = Math.min(Math.max(y, 0), 1);
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty('--cursor-x', `${(clampedX * 100).toFixed(2)}%`);
  rootStyle.setProperty('--cursor-y', `${(clampedY * 100).toFixed(2)}%`);

  const parallaxRangeX = 80;
  const parallaxRangeY = 60;
  const offsetX = (clampedX - 0.5) * parallaxRangeX;
  const offsetY = (clampedY - 0.5) * parallaxRangeY;
  rootStyle.setProperty('--cursor-parallax-x', `${offsetX.toFixed(2)}px`);
  rootStyle.setProperty('--cursor-parallax-y', `${offsetY.toFixed(2)}px`);
}

function initReactiveBackground() {
  if (prefersReducedMotion()) {
    setBackgroundCursor(0.5, 0.5);
    return;
  }

  setBackgroundCursor(lastPointerPosition.x, lastPointerPosition.y);

  const handlePointerMove = (event) => {
    const { innerWidth, innerHeight } = window;
    if (!innerWidth || !innerHeight) return;
    lastPointerPosition = {
      x: event.clientX / innerWidth,
      y: event.clientY / innerHeight,
    };
    setBackgroundCursor(lastPointerPosition.x, lastPointerPosition.y);
  };

  const resetCursor = () => {
    lastPointerPosition = { x: 0.5, y: 0.5 };
    setBackgroundCursor(lastPointerPosition.x, lastPointerPosition.y);
  };

  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerleave', resetCursor);
  window.addEventListener('blur', resetCursor);
  window.addEventListener('resize', () => {
    setBackgroundCursor(lastPointerPosition.x, lastPointerPosition.y);
  });
}

function onReady(fn) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn, { once: true });
  } else {
    fn();
  }
}

function resetSaveButtonState() {
  const button = document.getElementById('saveResultButton');
  if (!button) return;
  const original = button.dataset.originalLabel || 'Save result';
  button.textContent = original;
  button.disabled = false;
}

function showSaveConfirmation() {
  const button = document.getElementById('saveResultButton');
  if (!button) return;
  const original = button.dataset.originalLabel || button.textContent || 'Save result';
  button.dataset.originalLabel = original;
  button.textContent = 'Saved!';
  button.disabled = true;
  clearTimeout(saveConfirmationTimeout);
  saveConfirmationTimeout = setTimeout(() => {
    button.textContent = button.dataset.originalLabel || 'Save result';
    button.disabled = false;
  }, 1400);
}

function getSelectedOptionText(selectId) {
  const select = document.getElementById(selectId);
  if (!select || !select.selectedOptions || !select.selectedOptions.length) {
    return '';
  }
  return select.selectedOptions[0].textContent?.trim() || '';
}

function formatTimestamp(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/* Header scramble / rustle effect (vanilla JS version of the jQuery snippet provided).
   It scrambles letters and reveals the target text over time. Uses the
   page's prefers-reduced-motion setting to skip animation when requested.
*/
function startHeaderScramble() {
  const headerEl = document.querySelector('.header-copy h1');
  if (!headerEl) return;

  const theLetters = "abcdefghijklmnopqrstuvwxyz#%&^+=-";
  const speed = 50; // ms per frame
  const increment = 8; // frames per step

  const targetText = headerEl.textContent?.trim() || '';
  if (!targetText) return;

  // initialize
  const clen = targetText.length;
  let si = 0;
  let stri = 0;
  let block = '';
  let fixed = '';

  // clear the header to prepare for animation
  headerEl.textContent = '';

  // total iterations
  (function rustle(i) {
    setTimeout(function () {
      if (--i) {
        rustle(i);
      }
      nextFrame(i);
      si = si + 1;
    }, speed);
  })(clen * increment + 1);

  function nextFrame() {
    block = '';
    for (let i = 0; i < clen - stri; i += 1) {
      const num = Math.floor(theLetters.length * Math.random());
      const letter = theLetters.charAt(num);
      block = block + letter;
    }

    if (si === increment - 1) {
      stri++;
    }
    if (si === increment) {
      fixed = fixed + targetText.charAt(stri - 1);
      si = 0;
    }

    headerEl.textContent = fixed + block;
  }
}

function cloneRun(run) {
  if (!run) return null;
  try {
    if (typeof structuredClone === 'function') {
      return structuredClone(run);
    }
    return JSON.parse(JSON.stringify(run));
  } catch (error) {
    console.warn('Failed to clone saved run payload:', error);
    return { ...run };
  }
}

function makeSafeFilenamePart(value, fallback = 'run') {
  return (value || fallback)
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;
}

function persistSavedRuns() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(SAVED_RUNS_STORAGE_KEY, JSON.stringify(savedRuns));
  } catch (error) {
    console.warn('Unable to persist saved runs:', error);
  }
}

function renderSavedRuns(highlightId) {
  const list = document.getElementById('savedRunsList');
  const emptyState = document.getElementById('savedRunsEmpty');
  const clearButton = document.getElementById('clearSavedRunsButton');
  if (!list || !emptyState || !clearButton) return;

  list.innerHTML = '';

  if (!savedRuns.length) {
    emptyState.hidden = false;
    clearButton.hidden = true;
    return;
  }

  emptyState.hidden = true;
  clearButton.hidden = false;

  savedRuns.forEach((run) => {
    const item = document.createElement('li');
    item.className = 'saved-runs__item';
    item.dataset.runId = String(run.id);
    if (highlightId && run.id === highlightId) {
      item.classList.add('saved-runs__item--highlight');
      setTimeout(() => {
        item.classList.remove('saved-runs__item--highlight');
      }, 1200);
    }

    const title = document.createElement('div');
    title.className = 'saved-runs__title';
    const titleText = document.createElement('span');
    const providerLabel = run.providerName || run.providerCode || 'Provider';
    const regionLabel = run.regionLabel || run.regionName || '';
    titleText.textContent = regionLabel ? `${providerLabel} — ${regionLabel}` : providerLabel;
    title.appendChild(titleText);

    const badge = document.createElement('span');
    badge.className = 'saved-runs__badge';
    const carbonValue = Number.isFinite(run.carbonKg) ? run.carbonKg.toFixed(2) : '--';
    badge.textContent = `${carbonValue} kg CO₂e`;
    title.appendChild(badge);

    const summary = document.createElement('p');
    summary.className = 'saved-runs__summary';
    const hoursText = Number.isFinite(run.totals?.totalHours) ? `${run.totals.totalHours.toFixed(2)} h` : '--';
    const energyText = Number.isFinite(run.energyKWh) ? `${run.energyKWh.toFixed(2)} kWh` : '--';
    const ciText = Number.isFinite(run.regionCarbonIntensity) ? `${run.regionCarbonIntensity.toFixed(1)} g/kWh` : '--';
    summary.textContent = `Machine-hours: ${hoursText} • Energy: ${energyText} • CI: ${ciText}`;

    const timestamp = document.createElement('p');
    timestamp.className = 'saved-runs__timestamp';
    const timestampLabel = formatTimestamp(run.timestamp);
    if (timestampLabel) {
      timestamp.textContent = `Saved ${timestampLabel}`;
    } else {
      timestamp.textContent = '';
    }

    const actions = document.createElement('div');
    actions.className = 'saved-runs__actions';

    const loadButton = document.createElement('button');
    loadButton.type = 'button';
    loadButton.className = 'saved-runs__button';
    loadButton.dataset.action = 'load';
    loadButton.dataset.id = String(run.id);
    loadButton.textContent = 'Load inputs';

    const downloadButton = document.createElement('button');
    downloadButton.type = 'button';
    downloadButton.className = 'saved-runs__button';
    downloadButton.dataset.action = 'download';
    downloadButton.dataset.id = String(run.id);
    downloadButton.textContent = 'Download JSON';

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'saved-runs__button';
    deleteButton.dataset.action = 'delete';
    deleteButton.dataset.id = String(run.id);
    deleteButton.textContent = 'Remove';

    actions.appendChild(loadButton);
    actions.appendChild(downloadButton);
    actions.appendChild(deleteButton);

    item.appendChild(title);
    item.appendChild(summary);
    if (timestampLabel) {
      item.appendChild(timestamp);
    }
    item.appendChild(actions);

    list.appendChild(item);
  });
}

function loadSavedRunsFromStorage() {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(SAVED_RUNS_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      savedRuns = parsed
        .filter((entry) => entry && typeof entry === 'object')
        .slice(0, MAX_SAVED_RUNS);
      renderSavedRuns();
    }
  } catch (error) {
    console.warn('Failed to load saved runs from storage:', error);
  }
}

function downloadRun(run) {
  if (!run) {
    alert('Nothing to download yet. Run a calculation first.');
    return;
  }

  try {
    const safeProvider = makeSafeFilenamePart(run.providerCode || run.providerName, 'provider');
    const stamp = run.timestamp ? run.timestamp.replace(/[:.]/g, '-') : Date.now();
    const filename = `green-fuzzing-${safeProvider}-${stamp}.json`;
    const blob = new Blob([JSON.stringify(run, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  } catch (error) {
    console.error('Unable to download run data:', error);
    alert('Download failed. Please try again.');
  }
}

function downloadCurrentResult() {
  if (!lastResult) {
    alert('Run a calculation before downloading the result.');
    return;
  }
  downloadRun(lastResult);
}

function saveCurrentResult() {
  if (!lastResult) {
    alert('Run a calculation before saving.');
    return;
  }
  const storedRun = cloneRun(lastResult);
  if (!storedRun) return;
  savedRuns = [storedRun, ...savedRuns.filter((run) => run.id !== storedRun.id)];
  if (savedRuns.length > MAX_SAVED_RUNS) {
    savedRuns.length = MAX_SAVED_RUNS;
  }
  persistSavedRuns();
  renderSavedRuns(storedRun.id);
  showSaveConfirmation();
}

function clearSavedRuns() {
  savedRuns = [];
  persistSavedRuns();
  renderSavedRuns();
}

function handleSavedRunsClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const runId = Number(button.dataset.id);
  if (!Number.isFinite(runId)) return;
  const run = savedRuns.find((entry) => entry.id === runId);
  if (!run) return;

  if (button.dataset.action === 'load') {
    applySavedRunToForm(run);
  } else if (button.dataset.action === 'download') {
    downloadRun(run);
  } else if (button.dataset.action === 'delete') {
    savedRuns = savedRuns.filter((entry) => entry.id !== runId);
    persistSavedRuns();
    renderSavedRuns();
  }
}

function applySavedRunToForm(run) {
  if (!run || !run.inputs) return;
  if (!dataReady) {
    alert('Data is still loading. Please try again in a moment.');
    return;
  }

  const {
    providerCode,
    regionName,
    cpuKey,
    cpuCount,
    memoryGb,
    memPower,
    length,
    trialMode,
    manualTotalTrials,
    fuzzingPairs,
    trialsPerPair,
    derivedTotalTrials,
  } = run.inputs;

  const providerSelect = document.getElementById('provider');
  const regionSelect = document.getElementById('region');
  const cpuSelect = document.getElementById('cpu');
  if (!providerSelect || !regionSelect || !cpuSelect) return;

  if (providerCode) {
    providerSelect.value = providerCode;
    if (providerSelect.value !== providerCode) {
      alert(`The provider "${providerCode}" is no longer available. Please choose another provider.`);
      return;
    }
    providerSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }

  if (regionName) {
    regionSelect.value = regionName;
    if (regionSelect.value === regionName) {
      regionSelect.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      alert(`The region "${regionName}" is no longer available for ${providerCode || 'this provider'}. Please choose another region.`);
      return;
    }
  }

  if (cpuKey) {
    cpuSelect.value = cpuKey;
    if (cpuSelect.value === cpuKey) {
      cpuSelect.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      alert(`The CPU "${cpuKey}" is no longer available. Please choose another processor.`);
      return;
    }
  }

  const cpuCountInput = document.getElementById('cpuCount');
  if (cpuCountInput && Number.isFinite(cpuCount)) {
    cpuCountInput.value = cpuCount;
  }

  const memoryInput = document.getElementById('memory');
  if (memoryInput && Number.isFinite(memoryGb)) {
    memoryInput.value = memoryGb;
  }

  const memPowerInput = document.getElementById('memPower');
  if (memPowerInput) {
    const value = Number.isFinite(memPower) ? memPower : appData.memPowerDefault;
    memPowerInput.value = value;
  }

  const lengthInput = document.getElementById('length');
  if (lengthInput && Number.isFinite(length)) {
    lengthInput.value = length;
  }

  const trialRadios = Array.from(document.querySelectorAll('input[name="trialMode"]'));
  const activeMode = trialMode || 'total';
  const targetRadio = trialRadios.find((radio) => radio.value === activeMode);
  if (targetRadio) {
    targetRadio.checked = true;
    targetRadio.dispatchEvent(new Event('change', { bubbles: true }));
  }

  if (activeMode === 'pairs') {
    const fuzzingPairsInput = document.getElementById('fuzzingPairs');
    const trialsPerPairInput = document.getElementById('trialsPerPair');
    if (fuzzingPairsInput && Number.isFinite(fuzzingPairs)) {
      fuzzingPairsInput.value = fuzzingPairs;
    }
    if (trialsPerPairInput && Number.isFinite(trialsPerPair)) {
      trialsPerPairInput.value = trialsPerPair;
    }
  } else {
    const totalTrialsInput = document.getElementById('totalTrials');
    if (totalTrialsInput) {
      if (Number.isFinite(manualTotalTrials)) {
        totalTrialsInput.value = manualTotalTrials;
      } else if (Number.isFinite(derivedTotalTrials)) {
        totalTrialsInput.value = derivedTotalTrials;
      }
    }
  }

  computeFootprint();
}
function parseCsv(text) {
  const rows = [];
  let current = [];
  let value = '';
  let insideQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (insideQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          value += '"';
          i += 1;
        } else {
          insideQuotes = false;
        }
      } else {
        value += char;
      }
    } else if (char === '"') {
      insideQuotes = true;
    } else if (char === ',') {
      current.push(value);
      value = '';
    } else if (char === '\r') {
      // Ignore carriage returns
    } else if (char === '\n') {
      current.push(value);
      rows.push(current);
      current = [];
      value = '';
    } else {
      value += char;
    }
  }

  if (value || current.length) {
    current.push(value);
    rows.push(current);
  }

  return rows.filter((row) => row.some((cell) => cell && cell.trim().length));
}

function getHeaderMap(headerRow) {
  const map = {};
  headerRow.forEach((cell, index) => {
    if (cell) {
      map[cell.trim()] = index;
    }
  });
  return map;
}

function resolveCarbonIntensity(locationCode, locationFree) {
  if (locationCode) {
    const trimmed = locationCode.trim();
    if (appData.carbonByZone[trimmed] != null) {
      return { value: appData.carbonByZone[trimmed], fallback: false };
    }
    const baseCode = trimmed.split('-')[0];
    if (baseCode && appData.carbonByZone[baseCode] != null) {
      return { value: appData.carbonByZone[baseCode], fallback: false };
    }
  }

  if (locationFree) {
    const key = locationFree.trim().toLowerCase();
    if (key && appData.carbonByName[key] != null) {
      return { value: appData.carbonByName[key], fallback: false };
    }
  }

  return { value: appData.fallbackCI, fallback: true };
}

function applyAwsFallbackRegions() {
  const providerCode = 'aws';
  const provider = appData.providers[providerCode];
  if (!provider) return;
  const regions = provider.regions || {};
  if (Object.keys(regions).length) {
    return;
  }

  const defaultPue = appData.defaultPue[providerCode] ?? appData.defaultPue.Unknown ?? 1.56;
  AWS_FALLBACK_REGIONS.forEach(({ regionName, location, locationFree }) => {
    if (!regionName || regions[regionName]) return;
    const { value: ciValue, fallback } = resolveCarbonIntensity(location, locationFree);
    regions[regionName] = {
      location,
      locationFree: locationFree || '',
      pue: defaultPue,
      carbonIntensity: ciValue,
      ciFallback: fallback,
    };
  });

  appData.providers[providerCode].regions = regions;
}

async function fetchRequiredText(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function loadData() {
  try {
    const basePath = 'data/GA-data/v3.0/';
    const [
      providersText,
      datacentresText,
      defaultPueText,
      carbonText,
      cpuText,
    ] = await Promise.all([
      fetchRequiredText(`${basePath}providersNamesCodes.csv`),
      fetchRequiredText(`${basePath}cloudProviders_datacenters.csv`),
      fetchRequiredText(`${basePath}default_PUE.csv`),
      fetchRequiredText(`${basePath}CI_aggregated.csv`),
      fetchRequiredText(`${basePath}CPUs.csv`),
    ]);

    const providersRows = parseCsv(providersText);
    const providersHeaderIndex = providersRows.findIndex((row) => row[0] === 'provider');
    if (providersHeaderIndex !== -1) {
      const providerHeader = providersRows[providersHeaderIndex];
      const providerMap = getHeaderMap(providerHeader);
      providersRows.slice(providersHeaderIndex + 1).forEach((row) => {
        const code = row[providerMap.provider]?.trim();
        if (!code) return;
        const name = row[providerMap.providerName]?.trim() || code.toUpperCase();
        if (!appData.providers[code]) {
          appData.providers[code] = { name, regions: {} };
        } else {
          appData.providers[code].name = name;
        }
      });
    }

    const defaultPueRows = parseCsv(defaultPueText);
    const defaultPueHeaderIndex = defaultPueRows.findIndex((row) => row[0] === 'provider');
    if (defaultPueHeaderIndex !== -1) {
      const defaultHeader = defaultPueRows[defaultPueHeaderIndex];
      const defaultMap = getHeaderMap(defaultHeader);
      defaultPueRows.slice(defaultPueHeaderIndex + 1).forEach((row) => {
        const provider = row[defaultMap.provider]?.trim();
        const pueValue = parseFloat(row[defaultMap.PUE]);
        if (provider && Number.isFinite(pueValue)) {
          appData.defaultPue[provider] = pueValue;
        }
      });
    }

    const carbonRows = parseCsv(carbonText);
    if (carbonRows.length > 1) {
      const carbonHeader = carbonRows.find((row) => row[0] === 'location') || carbonRows[0];
      const carbonMap = getHeaderMap(carbonHeader);
      const startIndex = carbonRows.indexOf(carbonHeader) + 1;
      for (let i = startIndex; i < carbonRows.length; i += 1) {
        const row = carbonRows[i];
        const location = row[carbonMap.location]?.trim();
        if (!location) continue;
        const ci = parseFloat(row[carbonMap.carbonIntensity]);
        if (!Number.isFinite(ci)) continue;
        if (appData.carbonByZone[location] == null) {
          appData.carbonByZone[location] = ci;
        }
        const continentName = row[carbonMap.continentName]?.trim().toLowerCase();
        const countryName = row[carbonMap.countryName]?.trim().toLowerCase();
        const regionName = row[carbonMap.regionName]?.trim().toLowerCase();
        if (regionName && appData.carbonByName[regionName] == null) {
          appData.carbonByName[regionName] = ci;
        }
        if (countryName && appData.carbonByName[countryName] == null) {
          appData.carbonByName[countryName] = ci;
        }
        if (continentName && appData.carbonByName[continentName] == null) {
          appData.carbonByName[continentName] = ci;
        }
        const baseCode = location.split('-')[0];
        if (baseCode && appData.carbonByZone[baseCode] == null) {
          appData.carbonByZone[baseCode] = ci;
        }
      }
    }

    const datacentresRows = parseCsv(datacentresText);
    const datacentreHeaderIndex = datacentresRows.findIndex((row) => row[0] === 'provider');
    if (datacentreHeaderIndex !== -1) {
      const dcHeader = datacentresRows[datacentreHeaderIndex];
      const dcMap = getHeaderMap(dcHeader);
      datacentresRows.slice(datacentreHeaderIndex + 1).forEach((row) => {
        const providerCode = row[dcMap.provider]?.trim();
        const regionName = row[dcMap.Name]?.trim();
        if (!providerCode || !regionName) return;
        if (!appData.providers[providerCode]) {
          appData.providers[providerCode] = { name: providerCode.toUpperCase(), regions: {} };
        }
        const locationCode = row[dcMap.location]?.trim() || '';
        const locationFree = row[dcMap.location_freeForm]?.trim() || '';
        const pueParsed = parseFloat(row[dcMap.PUE]);
        const defaultPue = appData.defaultPue[providerCode] ?? appData.defaultPue.Unknown ?? 1.56;
        const pue = Number.isFinite(pueParsed) ? pueParsed : defaultPue;
        const { value: ciValue, fallback } = resolveCarbonIntensity(locationCode, locationFree);

        appData.providers[providerCode].regions[regionName] = {
          location: locationCode,
          locationFree,
          pue,
          carbonIntensity: ciValue,
          ciFallback: fallback,
        };
      });
    }

    applyAwsFallbackRegions();

    const cpuRows = parseCsv(cpuText);
    const cpuHeaderIndex = cpuRows.findIndex((row) => row[0] === 'model');
    if (cpuHeaderIndex !== -1) {
      const cpuHeader = cpuRows[cpuHeaderIndex];
      const cpuMap = getHeaderMap(cpuHeader);
      cpuRows.slice(cpuHeaderIndex + 1).forEach((row) => {
        const model = row[cpuMap.model]?.trim();
        if (!model || model === 'Average') return;
        const manufacturerIndex = cpuMap.Manufacturer ?? cpuMap.manufacturer;
        const manufacturer = manufacturerIndex != null ? row[manufacturerIndex]?.trim() : '';
        const tdp = parseFloat(row[cpuMap.TDP]);
        const cores = parseFloat(row[cpuMap.n_cores]);
        if (!Number.isFinite(tdp) || !Number.isFinite(cores) || cores <= 0) return;
        const key = manufacturer ? `${manufacturer} ${model}` : model;
        if (!appData.cpus[key]) {
          appData.cpus[key] = {
            model,
            manufacturer: manufacturer || 'Unknown',
            tdp,
            cores,
          };
        }
      });
    }

    populateProviders();
    populateCpuSelect();
    setDefaultMemPower();
    dataReady = true;
    renderSavedRuns();
  } catch (error) {
    console.error('Failed to load datasets from GA-data:', error);
    const hint = document.getElementById('providerHint');
    if (hint) {
      hint.textContent = 'Dataset missing. Run `git submodule update --init --recursive`, then reload.';
    }
    document.body.classList.add('data-load-error');
    const submit = document.querySelector('.calculator__submit');
    if (submit) {
      submit.disabled = true;
    }
    dataReady = false;
    toggleResultActions(false);
  }
}

function setDefaultMemPower() {
  const memInput = document.getElementById('memPower');
  if (!memInput) return;
  const value = appData.memPowerDefault;
  if (Number.isFinite(value)) {
    memInput.value = value.toFixed(4);
  } else {
    memInput.placeholder = '0.3725';
  }
}

function populateProviders() {
  const providerSelect = document.getElementById('provider');
  if (!providerSelect) return;
  providerSelect.innerHTML = '<option value="">--Select--</option>';
  Object.entries(appData.providers)
    .sort((a, b) => a[1].name.localeCompare(b[1].name))
    .forEach(([code, provider]) => {
      const option = document.createElement('option');
      option.value = code;
      const hasRegions = provider.regions && Object.keys(provider.regions).length > 0;
      option.textContent = hasRegions ? provider.name : `${provider.name} (regional data unavailable)`;
      if (!hasRegions) {
        option.disabled = true;
      }
      providerSelect.appendChild(option);
    });

  const hint = document.getElementById('providerHint');
  if (hint) {
    hint.textContent = 'Choose a provider to view its available regions. AWS entries use CI_aggregated fallbacks where needed.';
  }
}

function populateCpuSelect() {
  const cpuSelect = document.getElementById('cpu');
  if (!cpuSelect) return;
  cpuSelect.innerHTML = '<option value="">--Select--</option>';
  Object.entries(appData.cpus)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([key, cpu]) => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = `${key} (${cpu.cores} cores, ${cpu.tdp.toFixed(1)} W TDP)`;
      cpuSelect.appendChild(option);
    });
}

function updateRegions() {
  const providerCode = document.getElementById('provider').value;
  const regionSelect = document.getElementById('region');
  if (!regionSelect) return;
  regionSelect.innerHTML = '<option value="">--Select--</option>';

  if (!providerCode || !appData.providers[providerCode]) {
    const regionHint = document.getElementById('regionHint');
    if (regionHint) {
      regionHint.textContent = 'Region-specific efficiency and carbon data will appear here.';
    }
    resetTreeImpact();
    return;
  }

  const regions = Object.keys(appData.providers[providerCode].regions).sort((a, b) => a.localeCompare(b));
  if (!regions.length) {
    const regionHint = document.getElementById('regionHint');
    if (regionHint) {
      regionHint.textContent = 'Regional data is not available for this provider yet.';
    }
    resetTreeImpact('Regional data is not available for this provider yet.');
    return;
  }
  regions.forEach((regionName) => {
    const option = document.createElement('option');
    option.value = regionName;
    const region = appData.providers[providerCode].regions[regionName];
    const locationLabel = region.location || region.locationFree;
    option.textContent = locationLabel ? `${regionName} (${locationLabel})` : regionName;
    regionSelect.appendChild(option);
  });

  const hint = document.getElementById('regionHint');
  if (hint) {
    hint.textContent = 'Select a region to load its efficiency and carbon intensity.';
  }

  resetTreeImpact('Select a region and compute to compare impacts across this provider.');
}

function updateRegionHint() {
  const providerCode = document.getElementById('provider').value;
  const regionName = document.getElementById('region').value;
  const hint = document.getElementById('regionHint');
  if (!hint) return;

  if (!providerCode || !regionName) {
    hint.textContent = 'Region-specific efficiency and carbon data will appear here.';
    return;
  }

  const region = appData.providers[providerCode]?.regions[regionName];
  if (!region) {
    hint.textContent = 'Region-specific efficiency and carbon data will appear here.';
    return;
  }

  const pieces = [];
  if (region.location) {
    pieces.push(`Location code: ${region.location}`);
  } else if (region.locationFree) {
    pieces.push(`Location: ${region.locationFree}`);
  }
  pieces.push(`PUE ${region.pue.toFixed(2)}`);
  pieces.push(`Carbon intensity ${region.carbonIntensity.toFixed(2)} gCO₂e/kWh${region.ciFallback ? ' (fallback)' : ''}`);

  hint.textContent = pieces.join(' • ');
}

function updateCpuHint() {
  const cpuKey = document.getElementById('cpu').value;
  const hint = document.getElementById('cpuHint');
  if (!hint) return;

  if (!cpuKey || !appData.cpus[cpuKey]) {
    hint.textContent = 'Select a CPU to load its TDP and core count.';
    return;
  }

  const cpu = appData.cpus[cpuKey];
  const perCore = cpu.tdp / cpu.cores;
  hint.textContent = `${cpu.manufacturer} ${cpu.model} • ${cpu.cores} cores • ${cpu.tdp.toFixed(1)} W TDP (${perCore.toFixed(1)} W per core)`;
}

function setupTrialModeControls() {
  const totalInputs = document.getElementById('trialInputsTotal');
  const perPairInputs = document.getElementById('trialInputsPerPair');
  const radios = document.querySelectorAll('input[name="trialMode"]');

  if (!totalInputs || !perPairInputs || !radios.length) {
    return;
  }

  const updateVisibility = () => {
    const selected = document.querySelector('input[name="trialMode"]:checked')?.value || 'total';
    if (selected === 'pairs') {
      perPairInputs.removeAttribute('hidden');
      totalInputs.setAttribute('hidden', '');
    } else {
      totalInputs.removeAttribute('hidden');
      perPairInputs.setAttribute('hidden', '');
    }
  };

  radios.forEach((radio) => {
    radio.addEventListener('change', updateVisibility);
  });

  updateVisibility();
}

document.getElementById('provider').addEventListener('change', () => {
  updateRegions();
  updateRegionHint();
});
document.getElementById('region').addEventListener('change', () => {
  updateRegionHint();
  resetTreeImpact('Compute again to update the tree-year comparison.');
});
document.getElementById('cpu').addEventListener('change', updateCpuHint);

const saveResultButton = document.getElementById('saveResultButton');
if (saveResultButton) {
  saveResultButton.addEventListener('click', saveCurrentResult);
}

const downloadResultButton = document.getElementById('downloadResultButton');
if (downloadResultButton) {
  downloadResultButton.addEventListener('click', downloadCurrentResult);
}

const savedRunsList = document.getElementById('savedRunsList');
if (savedRunsList) {
  savedRunsList.addEventListener('click', handleSavedRunsClick);
}

const clearSavedRunsButton = document.getElementById('clearSavedRunsButton');
if (clearSavedRunsButton) {
  clearSavedRunsButton.addEventListener('click', clearSavedRuns);
}

const restartButtons = Array.from(document.querySelectorAll('[data-action="restart"]'));
restartButtons.forEach((button) => {
  button.addEventListener('click', restartCalculator);
});

onReady(() => {
  document.body.classList.add('is-ready');
  initReactiveBackground();
  loadSavedRunsFromStorage();
  toggleResultActions(Boolean(lastResult));
  // start the header scramble animation (respect prefers-reduced-motion)
  try {
    if (!prefersReducedMotion()) startHeaderScramble();
  } catch (e) {
    /* ignore if function missing */
  }
});

setupTrialModeControls();
window.onload = loadData;

function setRestartButtonsHidden(isHidden) {
  restartButtons.forEach((button) => {
    button.hidden = isHidden;
  });
}

function enterResultsMode() {
  const cardBody = document.querySelector('.card__body');
  if (cardBody) {
    cardBody.classList.add('card__body--collapsed');
  }
  setRestartButtonsHidden(false);
}

function restartCalculator() {
  const cardBody = document.querySelector('.card__body');
  if (cardBody) {
    cardBody.classList.remove('card__body--collapsed');
  }
  toggleResultActions(false);
  resetSaveButtonState();
  setResultsComputedState(false);
  setRestartButtonsHidden(true);
  const calculator = document.getElementById('calculator');
  if (calculator) {
    calculator.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const providerSelect = document.getElementById('provider');
    if (providerSelect) {
      providerSelect.focus();
    }
  }
}

function computeFootprint() {
  const providerCode = document.getElementById('provider').value;
  const regionName = document.getElementById('region').value;
  const cpuKey = document.getElementById('cpu').value;
  const cpuCount = parseInt(document.getElementById('cpuCount').value, 10);
  const memoryGb = parseFloat(document.getElementById('memory').value);
  const memPower = parseFloat(document.getElementById('memPower').value) || appData.memPowerDefault;
  const length = parseFloat(document.getElementById('length').value);
  const trialMode = document.querySelector('input[name="trialMode"]:checked')?.value || 'total';

  if (
    !providerCode ||
    !regionName ||
    !cpuKey ||
    !Number.isFinite(cpuCount) || cpuCount <= 0 ||
    !Number.isFinite(memoryGb) || memoryGb < 0 ||
    !Number.isFinite(memPower) || memPower < 0 ||
    !Number.isFinite(length) || length <= 0
  ) {
    resetTreeImpact('Complete the fields and compute to view tree comparisons.');
    alert('Please complete all fields with valid values.');
    return;
  }

  let totalHours;
  let totalTrialCount;
  let fuzzingPairs;
  let trialsPerPair;
  let manualTotalTrials;

  if (trialMode === 'pairs') {
    fuzzingPairs = parseInt(document.getElementById('fuzzingPairs').value, 10);
    trialsPerPair = parseInt(document.getElementById('trialsPerPair').value, 10);
    if (
      !Number.isFinite(fuzzingPairs) || fuzzingPairs <= 0 ||
      !Number.isFinite(trialsPerPair) || trialsPerPair <= 0
    ) {
      resetTreeImpact('Complete the fields and compute to view tree comparisons.');
      alert('Please enter valid values for the number of pairs and trials per pair.');
      return;
    }
    totalTrialCount = fuzzingPairs * trialsPerPair;
    totalHours = length * totalTrialCount;
  } else {
    manualTotalTrials = parseInt(document.getElementById('totalTrials').value, 10);
    if (!Number.isFinite(manualTotalTrials) || manualTotalTrials <= 0) {
      resetTreeImpact('Complete the fields and compute to view tree comparisons.');
      alert('Please enter a valid total number of trials.');
      return;
    }
    totalTrialCount = manualTotalTrials;
    totalHours = length * manualTotalTrials;
  }

  const region = appData.providers[providerCode]?.regions[regionName];
  const cpu = appData.cpus[cpuKey];
  if (!region || !cpu) {
    alert('Selected region or CPU data could not be found.');
    resetTreeImpact('Run a calculation to compare regions for the selected provider.');
    return;
  }

  const cpuPowerWatts = cpu.tdp * cpuCount;
  const memoryPowerWatts = memoryGb * memPower;
  const machinePowerWatts = cpuPowerWatts + memoryPowerWatts;
  const energyKWh = (machinePowerWatts / 1000) * totalHours * region.pue;
  const carbonKg = (energyKWh * region.carbonIntensity) / 1000;

  updateResultOutput(carbonKg, totalTrialCount, totalHours);

  const resultEnergy = document.getElementById('resultEnergy');
  if (resultEnergy) {
    resultEnergy.textContent = `Energy use: ${energyKWh.toFixed(2)} kWh (machine power ${machinePowerWatts.toFixed(1)} W × PUE ${region.pue.toFixed(2)})`;
  }

  const resultRegion = document.getElementById('resultRegion');
  if (resultRegion) {
    const locationPart = region.location || region.locationFree || 'unknown location';
    const ciLabel = `${region.carbonIntensity.toFixed(2)} gCO₂e/kWh${region.ciFallback ? ' (fallback)' : ''}`;
    resultRegion.textContent = `Region data: ${regionName} (${locationPart}) • PUE ${region.pue.toFixed(2)} • CI ${ciLabel}`;
  }

  const resultCpu = document.getElementById('resultCpu');
  if (resultCpu) {
    const perCore = cpu.tdp / cpu.cores;
    resultCpu.textContent = `CPU data: ${cpu.model} (${cpu.cores} cores, ${cpu.tdp.toFixed(1)} W TDP, ${cpuCount}× CPUs, ${perCore.toFixed(1)} W/core)`;
  }

  renderTreeImpactTable(providerCode, regionName, machinePowerWatts, totalHours);
  resetSaveButtonState();
  setResultsComputedState(true);

  const timestamp = new Date().toISOString();
  const runId = Date.now();
  const inputsSnapshot = {
    providerCode,
    regionName,
    cpuKey,
    cpuCount,
    memoryGb,
    memPower,
    length,
    trialMode,
    manualTotalTrials,
    fuzzingPairs,
    trialsPerPair,
    derivedTotalTrials: totalTrialCount,
  };

  lastResult = {
    id: runId,
    timestamp,
    providerCode,
    providerName: getSelectedOptionText('provider') || providerCode.toUpperCase(),
    regionName,
    regionLabel: getSelectedOptionText('region') || regionName,
    regionLocation: region.location || region.locationFree || '',
    regionCarbonIntensity: region.carbonIntensity,
    regionPue: region.pue,
    regionCiFallback: Boolean(region.ciFallback),
    cpuKey,
    cpuLabel: getSelectedOptionText('cpu') || cpuKey,
    cpuCount,
    memoryGb,
    memPower,
    length,
    trialMode,
    totals: { totalTrials: totalTrialCount, totalHours },
    fuzzingPairs: trialMode === 'pairs' ? fuzzingPairs : null,
    trialsPerPair: trialMode === 'pairs' ? trialsPerPair : null,
    carbonKg,
    energyKWh,
    machinePowerWatts,
    inputs: inputsSnapshot,
  };

  toggleResultActions(true);
  enterResultsMode();
}

function renderTreeImpactTable(providerCode, selectedRegionName, machinePowerWatts, totalHours) {
  const tableContainer = document.getElementById('treeImpactTable');
  const hint = document.getElementById('treeImpactHint');
  if (!tableContainer || !hint) return;

  const provider = appData.providers[providerCode];
  if (!provider) {
    hint.textContent = 'Run a calculation to compare regions for the selected provider.';
    tableContainer.innerHTML = '';
    return;
  }

  const entries = Object.entries(provider.regions || {});
  if (!entries.length) {
    hint.textContent = 'No regional data available for this provider yet.';
    tableContainer.innerHTML = '';
    return;
  }

  const rows = entries
    .map(([regionName, region]) => {
      const energy = (machinePowerWatts / 1000) * totalHours * region.pue;
      const carbon = (energy * region.carbonIntensity) / 1000;
      if (!Number.isFinite(carbon)) {
        return null;
      }
      const treeYears = carbon / TREE_CO2_ABSORPTION_KG_PER_YEAR;
      return {
        regionName,
        location: region.location || region.locationFree || 'Unknown location',
        pue: region.pue,
        carbon,
        treeYears,
        ci: region.carbonIntensity,
        isSelected: regionName === selectedRegionName,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.treeYears - b.treeYears);

  if (!rows.length) {
    hint.textContent = 'Regional carbon data could not be calculated with the current inputs.';
    tableContainer.innerHTML = '';
    return;
  }

  hint.textContent = 'Lower tree-years indicate less time a mature tree would need to offset the emissions.';

  const header = `
    <table>
      <thead>
        <tr>
          <th scope="col">Region</th>
          <th scope="col">Location</th>
          <th scope="col">Tree-years</th>
          <th scope="col">Carbon (kg CO₂e)</th>
          <th scope="col">Efficiency</th>
        </tr>
      </thead>
      <tbody>
  `;

  const body = rows
    .map((row) => {
      const iconCount = Math.max(1, Math.round(Math.min(row.treeYears, 5)));
      const icons = Array.from({ length: iconCount })
        .map(() => '<span class="tree-icon" aria-hidden="true">🌳</span>')
        .join('') + (row.treeYears > 5 ? '<span class="tree-icon tree-icon--more" aria-hidden="true">+</span>' : '');
      const srText = `<span class="sr-only">${row.treeYears.toFixed(2)} tree-years</span>`;
      const efficiency = `PUE ${row.pue.toFixed(2)} • CI ${row.ci.toFixed(1)} g/kWh`;
      return `
        <tr${row.isSelected ? ' class="is-selected"' : ''}>
          <th scope="row">${row.regionName}</th>
          <td>${row.location}</td>
          <td data-label="Tree-years">${srText}<span class="tree-icons" aria-hidden="true">${icons}</span><span class="tree-value">${row.treeYears.toFixed(2)}</span></td>
          <td data-label="Carbon">${row.carbon.toFixed(2)}</td>
          <td data-label="Efficiency">${efficiency}</td>
        </tr>
      `;
    })
    .join('');

  const footer = `
      </tbody>
    </table>
  `;

  tableContainer.innerHTML = `${header}${body}${footer}`;
}
