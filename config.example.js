// Copy this file to config.js and fill in your Apps Script URL + token.
// config.js is listed in .gitignore so it is never committed.
//
// How to get the URL:
//   1. Open your Google Sheet → Extensions → Apps Script
//   2. Paste google-apps-script/Code.gs
//   3. Project Settings (⚙) → Script Properties → add key "BTB_TOKEN" with a
//      random value (e.g. `openssl rand -hex 24`)
//   4. Deploy → New deployment (Execute as: Me, Who has access: Anyone)
//   5. Copy the Web App URL and paste it below, along with the same
//      BTB_TOKEN value.
//
// For GitHub Pages: add SHEET_URL and SHEET_TOKEN as repository secrets
// instead of editing this file.
// Settings → Secrets and variables → Actions → New repository secret

window.BTB_SHEET_URL = 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec';
window.BTB_SHEET_TOKEN = 'YOUR_BTB_TOKEN_VALUE';
