// Draws the card that link previews show: og:image, and the icon a phone keeps
// when the guide is added to a home screen. Both are committed under `public/`
// rather than built on every run, so the published bytes are the reviewed ones
// and no build depends on which fonts a machine happens to have installed.
//
// Run it after the hero screenshot, the plugin's one-line description, or the
// site's colours change: `npm run card` inside website/.
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import sharp from 'sharp';

const site = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(site, '..');
const PUBLIC = join(site, 'public');

// Obsidian's default dark theme, the same values src/styles/obsidian.css uses.
const BG = '#1e1e1e';
const TEXT = '#f2f2f2';
const MUTED = '#b3b3b3';
const ACCENT = '#a48cf2';
const HAIRLINE = '#3a3a3a';

// Liberation Sans is metric-compatible with Arial and present on the machines
// that regenerate this card; the fallbacks keep it legible elsewhere.
const FONT = 'Liberation Sans, DejaVu Sans, Arial, sans-serif';

const CARD = { width: 1200, height: 630 };
const PANEL = { left: 600, top: 92, width: 528, height: 446, radius: 14 };

/** The part of the hero screenshot that carries route, thumbnails, and lake. */
const CROP = { left: 380, top: 150, width: 1160, height: 980 };

const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');

const rounded = async (buffer, { width, height, radius }) => {
	const mask = Buffer.from(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
			`<rect width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`
	);
	return sharp(buffer)
		.composite([{ input: mask, blend: 'dest-in' }])
		.png()
		.toBuffer();
};

const panel = await rounded(
	await sharp(join(repo, 'docs', 'images', 'map-view.png'))
		.extract(CROP)
		.resize(PANEL.width, PANEL.height, { fit: 'cover' })
		.png()
		.toBuffer(),
	PANEL
);

const tagline = ['A photo atlas and route viewer,', "built on Obsidian's native Maps view."];

const overlay = Buffer.from(
	`<svg xmlns="http://www.w3.org/2000/svg" width="${CARD.width}" height="${CARD.height}">
  <defs>
    <radialGradient id="glow" cx="0.08" cy="0.1" r="0.75">
      <stop offset="0" stop-color="#8b6cef" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#8b6cef" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${CARD.width}" height="${CARD.height}" fill="url(#glow)"/>
  <g transform="translate(72 96) scale(2)">
    <path d="M16 6c-4 0-7.2 3.1-7.2 7 0 5.2 6.4 12.3 6.7 12.6a0.7 0.7 0 0 0 1 0c0.3-0.3 6.7-7.4 6.7-12.6 0-3.9-3.2-7-7.2-7z" fill="#8b6cef"/>
    <circle cx="16" cy="13" r="2.6" fill="${BG}"/>
  </g>
  <text x="72" y="240" font-family="${FONT}" font-size="18" font-weight="700" letter-spacing="3.4" fill="${ACCENT}">OBSIDIAN PLUGIN</text>
  <text x="72" y="316" font-family="${FONT}" font-size="58" font-weight="700" fill="${TEXT}">Advanced Maps</text>
  ${tagline
		.map(
			(line, index) =>
				`<text x="72" y="${378 + index * 38}" font-family="${FONT}" font-size="24" fill="${MUTED}">${escape(line)}</text>`
		)
		.join('\n  ')}
  <rect x="${PANEL.left}" y="${PANEL.top}" width="${PANEL.width}" height="${PANEL.height}" rx="${PANEL.radius}" ry="${PANEL.radius}" fill="none" stroke="${HAIRLINE}" stroke-width="1"/>
</svg>`
);

await sharp({ create: { ...CARD, channels: 4, background: BG } })
	.composite([
		{ input: panel, left: PANEL.left, top: PANEL.top },
		{ input: overlay, left: 0, top: 0 },
	])
	// A palette keeps the card a third of its true-colour size; a crawler only
	// ever shows it at a few hundred pixels wide.
	.png({ palette: true, quality: 90, effort: 10 })
	.toFile(join(PUBLIC, 'social-card.png'));

// Safari and Android home screens want a raster icon; the favicon stays SVG.
await sharp(join(PUBLIC, 'favicon.svg'), { density: 720 })
	.resize(180, 180)
	.flatten({ background: BG })
	.png({ compressionLevel: 9 })
	.toFile(join(PUBLIC, 'apple-touch-icon.png'));

console.log('wrote public/social-card.png and public/apple-touch-icon.png');
