# ENU public map data

The public map accepts a Google Sheet published as CSV. Every value in this sheet is public and downloadable by anyone who can open the map.

## Required columns

| Column | Format | Example |
| --- | --- | --- |
| `name` | Text | Oliver |
| `lat` | Number | 53.544 |
| `lng` | Number | -113.516 |
| `permits` | Whole number, zero or higher | 210 |
| `infill` | Whole number, zero or higher | 120 |
| `enu_presence` | Yes or No | Yes |
| `ward` | Text | O-day'min |

## Optional columns

`councillor`, `leader`, `leader_email`, `public_notes`, and `last_updated`.

Do not include private volunteer information, internal strategy notes, private email addresses, petition details, or anything ENU does not intend to publish.

## Connection steps

1. Import `neighbourhoods-template.csv` into Google Sheets.
2. Use **File → Share → Publish to web** and select CSV.
3. Copy the published CSV URL.
4. Paste it into `publicCsvUrl` in `config.js`.

If the sheet is unavailable or invalid, the map automatically retains its demonstration data instead of going blank.
