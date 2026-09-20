const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.TEST_URL || 'http://127.0.0.1:8000';
(async () => {
  // CHROME_PATH 指向自備的Chromium時不指定channel，供沒有安裝Chrome的環境（CI、容器）使用。
  const executablePath = process.env.CHROME_PATH || undefined;
  const channel = process.env.CHROME_CHANNEL || (executablePath ? undefined : 'chrome');
  const browser = await chromium.launch({ headless:true, channel, executablePath });
  const page = await browser.newPage({viewport:{width:1440,height:960}});
  const errors=[]; page.on('pageerror', e=>errors.push(e.message));
  await page.goto(base, {waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#buildings-status').textContent.startsWith('已載入'),{timeout:30000});
  assert.equal(await page.locator('#map3d').isVisible(),true);
  assert.equal(await page.locator('#map').isVisible(),false);
  assert.match(await page.locator('#model-inventory').textContent(),/117 個區塊/);
  const fractional = await page.evaluate(()=>DD3D.camera().zoom);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#buildings-status').textContent.startsWith('已載入'));
  assert.ok(Math.abs((await page.evaluate(()=>DD3D.camera().zoom))-fractional)<0.01);
  await page.locator('#model-pitch').fill('35');
  await page.locator('#model-pitch').dispatchEvent('input');
  assert.ok(Math.abs((await page.evaluate(()=>DD3D.camera().pitch))-35)<0.1);
  await page.selectOption('#model-color','white');
  await page.locator('#buildings-visible').uncheck();
  await page.waitForFunction(()=>document.querySelector('#buildings-status').textContent.includes('已關閉'));
  await page.locator('#buildings-visible').check();
  await page.waitForFunction(()=>document.querySelector('#buildings-status').textContent.startsWith('已載入'));
  await page.locator('#btn-3d').click();
  assert.equal(await page.locator('#map').isVisible(),true);
  assert.match(page.url(),/v=2d/);
  await page.reload({waitUntil:'domcontentloaded'});
  assert.equal(await page.locator('#map').isVisible(),true);
  await page.locator('#btn-3d').click();
  await page.waitForFunction(()=>document.querySelector('#buildings-status').textContent.startsWith('已載入'));
  await page.locator('[data-place="13.752,51.066"]').click();
  await page.waitForTimeout(1800);
  const before=await page.evaluate(()=>DD3D.camera());
  assert.ok(Math.abs(before.center.lat-51.066)<0.001);
  const share=page.url();
  await page.goto(share,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#buildings-status').textContent.startsWith('已載入'));
  const after=await page.evaluate(()=>DD3D.camera());
  assert.ok(Math.abs(after.center.lat-before.center.lat)<0.0001);
  assert.ok(Math.abs(after.pitch-before.pitch)<0.1);
  await page.locator('[data-place="13.740,51.052"]').click();
  await page.waitForTimeout(2200);
  // Hit test real rendered buildings, without injecting model data.
  let found=false;
  for (const [x,y] of [[820,480],[900,550],[700,650],[820,600],[1000,600],[800,700]]) {
    await page.mouse.click(x,y);
    if (await page.locator('.building-popup').count()) {found=true;break;}
  }
  assert.ok(found,'A rendered building opens its height popup');
  assert.match(await page.locator('.building-popup').textContent(),/官方模型高度/);
  await page.locator('.maplibregl-popup-close-button').click();
  await page.screenshot({path:'/tmp/dresden-3d-final.png'});
  await page.setViewportSize({width:390,height:844});
  await page.locator('#sidebar-toggle').click();
  await page.waitForTimeout(400);
  const box=await page.locator('#map3d').boundingBox();
  assert.ok(box.width>350,'Mobile map fills screen with sidebar collapsed');
  await page.screenshot({path:'/tmp/dresden-3d-mobile.png'});
  assert.deepEqual(errors,[]);
  // A local data failure must not be mistaken for an empty city.
  const failure=await browser.newPage();
  await failure.route('**/data/buildings/*.geojson',route=>route.fulfill({status:503,body:'Unavailable'}));
  await failure.goto(base,{waitUntil:'domcontentloaded'});
  await failure.waitForFunction(()=>document.querySelector('#buildings-status').textContent.includes('載入失敗'));
  await failure.unroute('**/data/buildings/*.geojson');
  await failure.locator('#model-retry').click();
  await failure.waitForFunction(()=>document.querySelector('#buildings-status').textContent.startsWith('已載入'));
  // 比較頁的等面積輪廓：同一比例尺下，螢幕面積比必須等於真實面積比。
  const compare = await browser.newPage({viewport:{width:1440,height:960}});
  await compare.goto(base,{waitUntil:'domcontentloaded'});
  await compare.locator('[data-tab="compare"]').click();
  await compare.waitForFunction(()=>document.querySelector('#compare-outline svg'));
  const outline = await compare.evaluate(()=>{
    const svg=document.querySelector('#compare-outline svg');
    const area=(d)=>d.split('M').filter(Boolean).reduce((sum,seg)=>{
      const pts=seg.replace(/Z\s*$/,'').split('L').map(s=>s.split(',').map(Number));
      let a=0; for(let i=0;i<pts.length-1;i++) a+=pts[i][0]*pts[i+1][1]-pts[i+1][0]*pts[i][1];
      return sum+Math.abs(a/2);
    },0);
    return {
      paths:[...svg.querySelectorAll('path')].map(n=>area(n.getAttribute('d'))),
      squares:[...svg.querySelectorAll('rect')].map(n=>+n.getAttribute('width')*+n.getAttribute('height')),
      note:document.querySelector('#compare-outline-note').textContent,
    };
  });
  assert.equal(outline.paths.length,2);
  assert.equal(outline.squares.length,2);
  // 虛線方框＝官方統計面積（328.8 / 271.7997 km²）
  assert.ok(Math.abs(outline.squares[0]/outline.squares[1]-328.8/271.7997)<0.005,'官方面積方框等面積');
  // 實心輪廓＝手上的界線資料（283.56 / 270.32 km²，以Lambert方位等積投影量得）
  assert.ok(Math.abs(outline.paths[0]/outline.paths[1]-283.56/270.32)<0.005,'界線輪廓等面積');
  assert.match(outline.note,/61個統計分區（官方64個）/);
  await browser.close();
  console.log('PASS: real 3D data, controls, 2D/3D, share restore, picking, mobile, failure/retry, equal-area compare outline; no JS errors.');
})().catch(error=>{console.error(error);process.exit(1);});
