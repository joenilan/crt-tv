import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'renders');
fs.mkdirSync(OUT, { recursive: true });

const args = process.argv.slice(2);
const flag = (name) => {
    const i = args.indexOf(name);
    return i === -1 || i + 1 >= args.length ? '' : args[i + 1];
};
const dest = flag('--out');
const waitMs = parseInt(flag('--wait-ms') || '0', 10);
const chFlag = flag('--channel');

const MIME = {
    '.mp4': 'video/mp4', '.m4v': 'video/mp4',
    '.webm': 'video/webm', '.ogv': 'video/ogg',
    '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css',
    '.ttf': 'font/ttf', '.woff2': 'font/woff2',
};
const fileServer = http.createServer((req, res) => {
    const clean = req.url.split('?')[0].replace(/^\/+/, '');
    const f = clean === '' ? 'crt-tv.html' : clean;
    const rel = path.resolve(__dirname, f);
    if (rel.startsWith(__dirname) && fs.existsSync(rel)) {
        const ext = path.extname(rel).toLowerCase();
        res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
        fs.createReadStream(rel).pipe(res);
    } else {
        res.statusCode = 404;
        res.end('not found');
    }
});
await new Promise(r => fileServer.listen(0, r));
const port = fileServer.address().port;
const url = `http://localhost:${port}/`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: 'networkidle' });
if (chFlag !== '') {
    const idx = Math.min(Math.max(parseInt(chFlag, 10) || 0, 0), 60);
    await page.evaluate((i) => window.CrtTV.swapChannel(i), idx);
}
await page.waitForTimeout(800);
await page.waitForTimeout(waitMs);
// wait for any injected local <video> (Phase 5) to have data before shooting
await page.waitForFunction(() => {
    const v = document.querySelector('video');
    return !v || v.readyState >= 2;
}, { timeout: 4000 }).catch(() => {});

const file = dest ? path.resolve(__dirname, dest) : path.join(OUT, 'frame.png');
await page.screenshot({ path: file });
console.log('SAVED', file);

await browser.close();
fileServer.close();
