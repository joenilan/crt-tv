import { chromium } from 'playwright';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fileServer = http.createServer((req, res) => {
    const f = path.join(__dirname, req.url === '/' ? 'crt-tv.html' : req.url.split('?')[0]);
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
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR: ' + String(e)));
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
page.on('requestfailed', r => errs.push('REQFAIL: ' + r.url() + ' ' + (r.failure() && r.failure().errorText)));
page.on('response', async r => {
    const u = r.url();
    if (u.includes('crt-tv.js')) console.log('SCRIPT-RESP', u, r.status());
});
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
const exposed = await page.evaluate(() => !!window.CrtTV);
console.log('CrtTV exposed?', exposed);
console.log('--- errors ---');
errs.slice(0, 12).forEach(e => console.log(e));
console.log('--- screenshot ---');
await page.screenshot({ path: path.join(__dirname, 'renders', 'diag.png') });
console.log('SAVED diag.png');
await browser.close();
fileServer.close();
