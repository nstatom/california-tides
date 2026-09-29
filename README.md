# California Tides v1.3

Static GitHub Pages site for NOAA CO-OPS tide predictions and observations at nine California stations.

## Stations

- La Jolla — 9410230
- Los Angeles — 9410660
- Santa Barbara — 9411340
- San Luis — 9412110
- Monterey — 9413450
- San Francisco — 9414290
- Point Arena — 9416841
- Humboldt — 9418767
- Crescent City — 9419750

Santa Monica and Point Reyes were removed from the first version.

## Important time handling

NOAA data are requested in GMT internally. The site then displays those timestamps as either UTC or Pacific local time. This avoids interpreting NOAA local-time strings as UTC.

## GitHub Pages

Upload `index.html`, `style.css`, `stations.js`, `app.js`, and this README to a repository. In GitHub choose **Settings → Pages → Deploy from a branch**, then select `main` and `/ (root)`.
