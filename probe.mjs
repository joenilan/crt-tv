import { chromium } from 'playwright';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fileServer = http.createServer((req, res) => {
    const f = req.url === '/' ? 'crt-tv.html' : req.url.split('?')[0];
    const rel = path.resolve(__dirname, f);
    if (rel.startsWith(__dirname) && fs.existsSync(rel)) {
        res.setHeader('Content-Type', rel.endsWith('.js') ? 'text/javascript' : 'text/html');
        fs.createReadStream(rel).pipe(res);
    } else { res.statusCode = 404; res.end('nf'); }
});
await new Promise(r => fileServer.listen(0, r));
const url = `http://localhost:${fileServer.address().port}/`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(300);

const sample = async (label, wait) => {
    await page.waitForTimeout(wait);
    const info = await page.evaluate(() => {
        const c = document.getElementById('screen');
        const ctx = c.getContext('2d');
        const W = c.width, H = c.height;
        const img = ctx.getImageData(0, 0, W, H);
        const d = img.data;
        let sumR = 0, sumG = 0, sumB = 0, count = 0, dark = 0, bright = 0, redHits = 0, blueHits = 0;
        for (let i = 0; i < d.length; i += 4) {
            const r = d[i], g = d[i+1], b = d[i+2];
            sumR += r; sumG += g; sumB += b; count++;
            if (r < 15 && g < 15 && b < 15) dark++;
            else bright++;
            if (r > 90 && g < 60 && b < 60) redHits++;
            if (b > 80 && r < 90) blueHits++;
        }
        return { label, avgR: (sumR/count).toFixed(1), avgG: (sumG/count).toFixed(1), avgB: (sumB/count).toFixed(1),
                 bright, brightPct: (bright/count*100).toFixed(1), redHits, blueHits };
    });
    console.log(JSON.stringify(info));
};

await sample('t=600', 300);
await sample('t=1200', 600);
await sample('t=1800', 600);
await sample('t=3000', 1200);
await sample('t=6000', 3000);

await browser.close();
fileServer.close();
