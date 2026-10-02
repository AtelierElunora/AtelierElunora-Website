Place your licensed .otf or .ttf files in this folder, then build and run.

This folder is already included in Xcode's Copy Bundle Resources phase as a
folder reference. You do not need to register each file or set UIAppFonts.
Copy into this existing folder in Finder; do not add a second BrandedFonts
reference in Xcode. Its contents are included in device builds and archives.

Automatic choices:
- Brown Carolina Regular: body text.
- Edwardian Script: headings, when present; otherwise Brown Carolina.
- Brown Carolina Medium/Semibold/Bold: buttons and small capitals.
- Without a heavier Brown Carolina face, buttons/capitals use system semibold.
- A light-only face can be used for headings, with system regular for body.

Filenames do not matter. The app discovers each font's internal family,
PostScript name and actual weight. Subfolders and .OTF/.TTF also work.

WOFF/WOFF2 are web fonts. Obtain their original OTF/TTF edition; changing
extensions does not convert them. No proprietary fonts are supplied here.

No in-app import or setup is required. Check Account > App fonts for the
active font names and a live preview. Changes to this folder require a new
build; they apply to everyone installing that build. Keep your bundle ID.
