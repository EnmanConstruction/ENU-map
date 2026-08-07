# ENU public map data

The public map accepts a Google Sheet published as CSV. Every value in this sheet is public and downloadable by anyone who can open the map.

## Required columns

| Column | Format | Example |
| --- | --- | --- |
| `name` | Text | Wîhkwêntôwin |
| `lat` | Number | 53.541983 |
| `lng` | Number | -113.523994 |
| `permits` | Whole number, zero or higher | 34 |
| `infill` | Whole number, zero or higher | 1 |
| `enu_presence` | Yes or No | Yes |
| `ward` | Text | O-day'min |

## Optional columns

`councillor`, `community_league`, `leader`, `leader_email`, `public_notes`, and `last_updated`.

When `community_league` is blank, the map retains the verified City-backed relationship for that neighbourhood. Do not guess a league from the nearest hall; one league can serve several neighbourhoods.

Do not include private volunteer information, internal strategy notes, private email addresses, petition details, or anything ENU does not intend to publish.

## Current metric definitions

- `permits`: City development-permit records whose status is `In Progress`, grouped by neighbourhood.
- `infill`: legacy column name retained for compatibility. It currently means general building permits issued in the trailing 24 months where work type is `(01) Building - New` and at least one dwelling unit was added. The interface describes this as **new-home permits**, not as an official City infill classification.
- `enu_presence`: ENU-owned information. The starter values were carried forward from the original demonstration and must be confirmed by ENU before the sheet becomes the official live source.

The City-backed snapshot was assembled on August 6, 2026. Permit datasets update frequently, so record the refresh date whenever these counts are regenerated.

## Connection steps

1. Import `neighbourhoods-template.csv` into Google Sheets.
2. Use **File → Share → Publish to web** and select CSV.
3. Copy the published CSV URL.
4. Paste it into `publicCsvUrl` in `config.js`.

If the sheet is unavailable or invalid, the map automatically retains its demonstration data instead of going blank.
