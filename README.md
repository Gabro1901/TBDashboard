# TBDashboard (Trial Balance Dashboard)

TBDashboard is an automated financial reporting system that takes trial balance data and automatically generates key financial statements, including:
- **Balance Sheet (Stato Patrimoniale)**
- **Income Statement (Conto Economico)**
- **Cash Flow Statement (Rendiconto Finanziario)**

It also features a customizable dashboard for tracking financial KPIs, built natively with Vanilla JavaScript, HTML, and CSS.

## Features

- **Automated Reporting**: Instantly translates trial balances into formatted financial statements.
- **Interactive Dashboard**: Visualizes data through charts and KPIs.
- **Legacy Support**: Completely vanilla stack requiring no build steps, just open `index.html` in your browser.
- **Document Management**: Built-in support for uploading and managing related financial documents.

## Getting Started

Since this is a vanilla JavaScript application, no installation or compilation step is strictly necessary.

1. Clone this repository.
2. Open `index.html` in any modern web browser.
3. Start exploring the dashboard!

*(Note: If you want to use the dev server for hot reloading, you can still run `npm install` and `npm run dev` as the Vite server configuration is present.)*

## Architecture

- **`index.html`**: Entry point containing the core app shell.
- **`/js/`**: Vanilla JavaScript modules that power the application state, trial balances, and dashboard metrics.
- **`/css/`**: Pure CSS files for styling, including variables for the theme and layout.

## License
MIT
