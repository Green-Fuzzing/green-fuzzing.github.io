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

async function fetchRequiredText(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function loadData() {
  try {
    const basePath = 'data/GA-data/v4.0_dev/';
    const [
      providersText,
      datacentresText,
      defaultPueText,
      carbonText,
      cpuText,
      hardwareText,
    ] = await Promise.all([
      fetchRequiredText(`${basePath}cloud-providers.csv`),
      fetchRequiredText(`${basePath}data-centres/DC-cloud_2023.csv`),
      fetchRequiredText(`${basePath}data-centres/default-PUE_2024.csv`),
      fetchRequiredText(`${basePath}carbon-intensity/electricitymap/CI-electricitymap-yearly_2024.csv`),
      fetchRequiredText(`${basePath}chips/manual/CPUs-manual.csv`),
      fetchRequiredText(`${basePath}hardware-impacts.csv`),
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

    const hardwareRows = parseCsv(hardwareText);
    const memoryRow = hardwareRows.find((row) => row[0] === 'memoryPower');
    if (memoryRow) {
      const parsed = parseFloat(memoryRow[1]);
      if (Number.isFinite(parsed)) {
        appData.memPowerDefault = parsed;
      }
    }

    const carbonRows = parseCsv(carbonText);
    if (carbonRows.length > 1) {
      const carbonHeader = carbonRows[0];
      const carbonMap = getHeaderMap(carbonHeader);
      for (let i = 1; i < carbonRows.length; i += 1) {
        const row = carbonRows[i];
        const zoneId = row[carbonMap['Zone id']]?.trim();
        const zoneName = row[carbonMap['Zone name']]?.trim().toLowerCase();
        const lifecycle = parseFloat(row[carbonMap['Carbon intensity gCO₂eq/kWh (Life cycle)']]);
        const direct = parseFloat(row[carbonMap['Carbon intensity gCO₂eq/kWh (direct)']]);
        const ci = Number.isFinite(lifecycle) ? lifecycle : Number.isFinite(direct) ? direct : null;
        if (zoneId && ci != null && appData.carbonByZone[zoneId] == null) {
          appData.carbonByZone[zoneId] = ci;
        }
        if (zoneName && ci != null && appData.carbonByName[zoneName] == null) {
          appData.carbonByName[zoneName] = ci;
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

    const cpuRows = parseCsv(cpuText);
    const cpuHeaderIndex = cpuRows.findIndex((row) => row[0] === 'model');
    if (cpuHeaderIndex !== -1) {
      const cpuHeader = cpuRows[cpuHeaderIndex];
      const cpuMap = getHeaderMap(cpuHeader);
      cpuRows.slice(cpuHeaderIndex + 1).forEach((row) => {
        const model = row[cpuMap.model]?.trim();
        if (!model || model === 'Average') return;
        const manufacturer = row[cpuMap.Manufacturer]?.trim();
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
      option.textContent = provider.name;
      providerSelect.appendChild(option);
    });

  const hint = document.getElementById('providerHint');
  if (hint) {
    hint.textContent = 'Choose a provider to view its available regions.';
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

const restartButtons = Array.from(document.querySelectorAll('[data-action="restart"]'));
restartButtons.forEach((button) => {
  button.addEventListener('click', restartCalculator);
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

  if (trialMode === 'pairs') {
    const fuzzingPairs = parseInt(document.getElementById('fuzzingPairs').value, 10);
    const trialsPerPair = parseInt(document.getElementById('trialsPerPair').value, 10);
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
    const totalTrials = parseInt(document.getElementById('totalTrials').value, 10);
    if (!Number.isFinite(totalTrials) || totalTrials <= 0) {
      resetTreeImpact('Complete the fields and compute to view tree comparisons.');
      alert('Please enter a valid total number of trials.');
      return;
    }
    totalTrialCount = totalTrials;
    totalHours = length * totalTrials;
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

  const output = document.getElementById('output');
  if (output) {
    output.innerHTML = `<div class="results__figure">${carbonKg.toFixed(2)} kg CO₂e</div><p>Total trials: ${totalTrialCount} • Total machine-hours: ${totalHours.toFixed(2)} h</p>`;
  }

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
