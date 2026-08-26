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

const fileServer = http.createServer((req, res) => {
    const clean = req.url.split('?')[0].replace(/^\/+/, '');
    const f = clean === '' ? 'crt-tv.html' : clean;
    const rel = path.resolve(__dirname, f);
    if (rel.startsWith(__dirname) && fs.existsSync(rel)) {
        res.setHeader('Content-Type', rel.endsWith('.js') ? 'text/javascript' : 'text/html');
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
await page.waitForTimeout(800);
await page.waitForTimeout(waitMs);

const file = dest ? path.resolve(__dirname, dest) : path.join(OUT, 'frame.png');
await page.screenshot({ path: file });
console.log('SAVED', file);

await browser.close();
fileServer.close();
