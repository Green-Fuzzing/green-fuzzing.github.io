# Fuzzing Campaign Carbon Footprint Calculator

This static web experience estimates the environmental impact of a fuzzing campaign using the [Green Algorithms](https://green-algorithms.org/) methodology. The UI lets you pick a cloud provider, data centre region, and CPU model sourced directly from the official GA dataset, then combines those characteristics with your campaign parameters to approximate energy use, carbon emissions, and the equivalent "tree years" required to offset them.

## Features
- **Dataset-driven inputs** – Providers, regions, CPU models, and carbon intensity figures are loaded from the `data/GA-data` submodule so the calculator always reflects the latest Green Algorithms reference data.
- **Comprehensive calculator** – Capture CPUs per machine, memory allocation, fuzzing trial counts, and more to generate a detailed emissions estimate.
- **Regional comparisons** – See how the campaign would perform in every region offered by the selected provider, including an easy-to-scan tree-year impact table.
- **MPI-SP themed UI** – Responsive, two-column layout with MPI-SP colours, gradients, and glassmorphism-inspired cards.

## Getting started
1. Clone the repository.
2. Initialise the Green Algorithms dataset submodule:
   ```bash
   git submodule update --init --recursive
   ```
3. Serve the site locally (for example with Python):
   ```bash
   python -m http.server
   ```
4. Visit [http://localhost:8000](http://localhost:8000) and open `index.html`.

Because the site is fully static you can also open `index.html` directly in a browser, but using a local server ensures that modern browsers allow the script to fetch the dataset files.

## Using the calculator
1. Choose a **cloud provider** – this unlocks the relevant regions from GA-data.
2. Select a **region / data centre** to view its power usage effectiveness (PUE) and grid carbon intensity hints.
3. Pick a **CPU model**; the app displays its thermal design power and core count.
4. Adjust **CPUs per machine**, **memory**, optional **memory power**, **campaign length**, **number of trials per pair**, and total **fuzzing trials (fuzzer × target pairs)**.
5. Press **Compute** to generate results, including estimated energy consumption, carbon emissions, and a region-by-region tree-year comparison.

Guidance below the form updates as you change selections so you can quickly see which combinations are most efficient.

## Updating the data
The Green Algorithms dataset is tracked as a Git submodule pointing to `https://github.com/GreenAlgorithms/GA-data`. To refresh the calculator with a newer revision:

```bash
git submodule update --remote --merge data/GA-data
```

After updating, rebuild or reload the page to pull in the latest CSV files.

## Project structure
- `index.html` – Application shell, form markup, and results layout.
- `style.css` – MPI-styled theme, layout, and component styling.
- `script.js` – Dataset loading, calculator logic, and rendering helpers.
- `data/GA-data` – Green Algorithms dataset (Git submodule).

## License & attribution
Please respect the [Green Algorithms usage notice](https://green-algorithms.org/usage-notice) when reusing the dataset or derived results. The calculator UI is provided for experimentation purposes; adapt it to your own workflow as needed.

> Most of this website was generated using GPT-5 Codex.
