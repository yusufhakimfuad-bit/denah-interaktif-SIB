# SIB Interactive School Map — Polished Prototype

A responsive interactive map for Sekolah Indonesia Bangkok, with a floating room information panel and a local admin editor.

## Run it
1. Open this folder in VS Code.
2. Enable the **Live Server** extension.
3. Right-click `index.html` → **Open with Live Server**.

The project uses `fetch()` for the SVG and JSON, so opening `index.html` directly as a `file://` page may not work.

## Included
- Click/tap rooms to show room information and photo.
- Search rooms by name/category/description.
- Touch drag, pinch-to-zoom, mouse-wheel zoom, zoom buttons, and bounded panning.
- Fullscreen map button for kiosk/display use.
- Local Admin mode to edit room metadata and upload room photos.
- Export/import JSON backups.
- Responsive layout for desktop, tablet, and phone.

## Admin mode
Click **⚙ Admin**, select a room, edit its information, choose a photo, and save. Data is stored in this browser only. Use **Export data** for a backup.

## Important limitation
This is still a static/local prototype. Local edits do not sync to other devices or visitors. To make a shared online admin system, the next technical step is deployment plus a hosted database and image storage (for example, Supabase or Firebase), with secure admin authentication.

Photos selected in the local editor are stored as browser data. For long-term use, export your data regularly. The online version should use hosted image storage.
