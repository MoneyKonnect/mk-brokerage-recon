# mk-brokerage-recon

Mutual-fund brokerage reconciliation for MoneyKonnect LLP (ARN-263998).
Compares expected trail brokerage (AMC rate cards x AUM) with the payout actually received,
at AMC, scheme, folio/client and lot level.

## Rules built in
- One folio can hold several schemes: lots are keyed by folio + scheme + transaction no. + period.
- Brokerage types: Trail and Additional. Additional is intentional income and is added to the same folio + scheme; only Trail is compared to the rate card.
- SIP installments use the rate in force on each installment date; a lump sum keeps its purchase-date rate until redemption.
- Expected = average assets x rate / 100 x days / 365.

## Layout
- `engine/` Python: rate-card parser, DBF reader, workbook builder.
- `rates/` parsed rate cards by AMC and quarter (no client data).
- `web/` static front end (Vercel). Processing is meant to run in the browser so client files are never uploaded.

## Privacy
Repo is private. `.gitignore` blocks csv/xls/xlsx/pdf/pkl. Do not commit payout files, holdings files or AMC PDFs.

## Status
Franklin: rate cards Feb-2023 to Dec-2026 parsed (gaps: Q1-24, Q3-24, Q4-24, Q1-26, pre-2023). Other AMCs: in progress.
