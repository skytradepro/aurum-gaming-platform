/**
 * Service worker of the HANNIBAL app (the website installed on the home screen).
 * It never stores pages, data or pictures: the app always shows the live website, so banners,
 * promotions, games and balances are the same as on the site at every moment. Its only job is a
 * clean "no internet" screen when the phone is offline.
 */

const OFFLINE_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#0b0806"><title>HANNIBAL</title>
<style>
html,body{margin:0;height:100%}
body{display:grid;place-items:center;background:radial-gradient(circle at 50% 40%,#3a1e0e,#0b0806 70%);color:#f4ead2;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;text-align:center;padding:24px;box-sizing:border-box}
h1{font-family:Georgia,serif;letter-spacing:.22em;color:#e8c46a;margin:0 0 14px;font-size:30px}
p{margin:0 0 22px;color:#d8c48f;font-size:16px;line-height:1.5}
button{border:0;border-radius:14px;padding:13px 26px;font-size:16px;font-weight:800;color:#1a1206;background:linear-gradient(180deg,#f7d77a,#c99a2e);cursor:pointer}
</style></head>
<body><main><h1>HANNIBAL</h1><p id="m">No internet connection.</p><button id="b" onclick="location.reload()">Try again</button></main>
<script>
var T={ar:["لا يوجد اتصال بالإنترنت.","حاول مجدداً"],fr:["Pas de connexion Internet.","Réessayer"],tr:["İnternet bağlantısı yok.","Tekrar dene"],ru:["Нет подключения к интернету.","Повторить"]};
var m=(document.cookie.match(/NEXT_LOCALE=([a-z]{2})/)||[])[1]||(navigator.language||"en").slice(0,2);
if(T[m]){document.getElementById("m").textContent=T[m][0];document.getElementById("b").textContent=T[m][1];if(m==="ar")document.dir="rtl";}
</script></body></html>`;

const SCRIPT = `// HANNIBAL app service worker (no cache: always the live website)
const CACHE = 'hb-offline-v1';
const OFFLINE_URL = '/__hb_offline';
const OFFLINE_HTML = ${JSON.stringify(OFFLINE_HTML)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.put(OFFLINE_URL, new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Pages always come from the server; only when the phone is offline the "no internet" screen is shown.
// Everything else (pictures, data, games) is left to the browser as on the website.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.mode !== 'navigate') return;
  event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
});
`;

export function GET(): Response {
  return new Response(SCRIPT, {
    headers: {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Service-Worker-Allowed': '/',
    },
  });
}
