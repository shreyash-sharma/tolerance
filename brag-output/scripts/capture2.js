// Usage: node capture.js [t1,t2,...]  (no args = all frames at 60fps for 15s)
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  pg.on('pageerror',e=>console.log('ERR',e.message));await pg.goto('file://' + path.resolve(__dirname, '../'+(process.env.COMP||'composition.html')));
  await pg.evaluate(() => window.ready);
  const ts = process.argv[2] ? process.argv[2].split(',').map(Number) : [...Array(900).keys()].map(i => i / 60);
  const out = process.argv[2] ? 'stills' : 'frames';
  require('fs').mkdirSync(path.join(__dirname, out), { recursive: true });
  for (let i = 0; i < ts.length; i++) {
    await pg.evaluate(t => window.render(t), ts[i]);
    const name = process.argv[2] ? `s_${ts[i].toFixed(2)}.png` : `f_${String(i).padStart(4, '0')}.png`;
    await pg.screenshot({ path: path.join(__dirname, out, name) });
  }
  await b.close();
})();
