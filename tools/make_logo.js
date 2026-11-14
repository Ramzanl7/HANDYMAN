const { chromium } = require('playwright'); const fs=require('fs');
const F=process.argv[2], OUT=process.argv[3];
const b64=p=>fs.readFileSync(F+'/'+p).toString('base64');
const ff=`@font-face{font-family:O;font-weight:700;src:url(data:font/woff2;base64,${b64('fontsource-oswald-5.0.0/files/oswald-latin-700-normal.woff2')})}
@font-face{font-family:O;font-weight:700;src:url(data:font/woff2;base64,${b64('fontsource-oswald-5.0.0/files/oswald-cyrillic-700-normal.woff2')});unicode-range:U+0400-04FF}
@font-face{font-family:M;font-weight:600;src:url(data:font/woff2;base64,${b64('fontsource-ibm-plex-mono-5.0.0/files/ibm-plex-mono-latin-600-normal.woff2')})}
@font-face{font-family:M;font-weight:600;src:url(data:font/woff2;base64,${b64('fontsource-ibm-plex-mono-5.0.0/files/ibm-plex-mono-cyrillic-600-normal.woff2')});unicode-range:U+0400-04FF}`;
const lvl=(w)=>`<svg width="${w}" viewBox="60 180 392 152"><rect x="76" y="196" width="360" height="120" rx="60" fill="#ffd400" stroke="#0f1830" stroke-width="14"/><path d="M206 196V316M306 196V316" stroke="#0f1830" stroke-width="10"/><ellipse cx="256" cy="256" rx="40" ry="30" fill="#fff" stroke="#0f1830" stroke-width="10"/><rect x="106" y="214" width="70" height="14" rx="7" fill="#fff" fill-opacity=".45"/></svg>`;
const grid=c=>`background-color:${c.bg};background-image:linear-gradient(${c.g} 2px,transparent 2px),linear-gradient(90deg,${c.g} 2px,transparent 2px);background-size:64px 64px`;
const pages={
 'logo-square.png':[1024,1024,`<div style="width:1024px;height:1024px;${grid({bg:'#1d2a44',g:'rgba(15,24,48,.35)'})};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:54px">${lvl(560)}<div style="text-align:center"><div style="font:700 168px/1 O;color:#ece8df;letter-spacing:.06em">HANDYMAN</div><div style="font:600 40px/1 M;color:#ffd400;letter-spacing:.32em;margin-top:28px">ГРОЗНЫЙ · МАСТЕР ПО ДОМУ</div></div></div>`],
 'logo-horizontal.png':[1800,600,`<div style="width:1800px;height:600px;${grid({bg:'#ece8df',g:'rgba(29,42,68,.07)'})};display:flex;align-items:center;justify-content:center;gap:80px"><div style="width:400px;height:400px;background:#1d2a44;display:grid;place-items:center;border-radius:48px">${lvl(330)}</div><div><div style="font:700 210px/0.95 O;color:#1d2a44;letter-spacing:.05em">HANDYMAN</div><div style="font:600 46px/1 M;color:#55607a;letter-spacing:.3em;margin-top:26px">ГРОЗНЫЙ · МАСТЕР ПО ДОМУ</div></div></div>`],
 'logo-icon.png':[1024,1024,`<div style="width:1024px;height:1024px;${grid({bg:'#1d2a44',g:'rgba(15,24,48,.35)'})};display:grid;place-items:center">${lvl(800)}</div>`],
};
(async()=>{const br=await chromium.launch();for(const [n,[w,h,html]] of Object.entries(pages)){const p=await br.newPage({viewport:{width:w,height:h}});await p.setContent(`<style>${ff}*{margin:0}body{width:${w}px;height:${h}px;overflow:hidden}</style>${html}`);await p.evaluate(()=>document.fonts.ready);await p.screenshot({path:OUT+'/'+n});}await br.close();})();
