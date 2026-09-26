const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const REPO = 'hviera01/Inventario';
const AGENTE = 'Inventario-App';
const URL_RELEASE = `https://api.github.com/repos/${REPO}/releases/latest`;

const clienteDe = (url) => (url.startsWith('https:') ? https : http);

function pedirJson(url, saltos = 0) {
  return new Promise((resolve, reject) => {
    if (saltos > 5) { reject(new Error('demasiadas redirecciones')); return; }
    const req = clienteDe(url).get(url, { headers: { 'User-Agent': AGENTE, Accept: 'application/vnd.github+json' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        pedirJson(res.headers.location, saltos + 1).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) { reject(new Error('HTTP ' + res.statusCode)); res.resume(); return; }
      let cuerpo = '';
      res.on('data', (d) => { cuerpo += d; });
      res.on('end', () => {
        try { resolve(JSON.parse(cuerpo)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => req.destroy(new Error('tiempo agotado')));
  });
}

function descargar(url, destino, saltos = 0) {
  return new Promise((resolve, reject) => {
    if (saltos > 5) { reject(new Error('demasiadas redirecciones')); return; }
    const req = clienteDe(url).get(url, { headers: { 'User-Agent': AGENTE } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        descargar(res.headers.location, destino, saltos + 1).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) { reject(new Error('HTTP ' + res.statusCode)); res.resume(); return; }
      const archivo = fs.createWriteStream(destino);
      res.pipe(archivo);
      archivo.on('finish', () => archivo.close(() => resolve()));
      archivo.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(120000, () => req.destroy(new Error('tiempo agotado')));
  });
}

function comparar(a, b) {
  const pa = String(a).replace(/^v/i, '').split('.').map(Number);
  const pb = String(b).replace(/^v/i, '').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x - y;
  }
  return 0;
}

async function buscarNueva(versionActual, urlRelease = URL_RELEASE) {
  const info = await pedirJson(urlRelease);
  if (!info || !info.tag_name || comparar(info.tag_name, versionActual) <= 0) return null;
  const asset = (info.assets || []).find((a) => a.name === 'Inventario.exe');
  if (!asset) return null;
  return { version: info.tag_name.replace(/^v/i, ''), url: asset.browser_download_url, notas: info.body || '' };
}

function scriptActualizar(destino, nuevo) {
  const q = (s) => s.replace(/'/g, "''");
  return `$ErrorActionPreference = 'SilentlyContinue'
$dest = '${q(destino)}'
$src = '${q(nuevo)}'
$intentos = 0
while ($intentos -lt 60) {
  Copy-Item -Path $src -Destination $dest -Force
  if ($?) { break }
  Start-Sleep -Milliseconds 500
  $intentos++
}
Start-Sleep -Milliseconds 400
Remove-Item -Path $src -Force
Start-Process -FilePath $dest
`;
}

async function descargarYPreparar(url) {
  const destino = process.env.PORTABLE_EXECUTABLE_FILE;
  if (!destino) throw new Error('Esta copia no es la versión portátil de Windows; no se puede actualizar sola.');
  const nuevo = path.join(os.tmpdir(), 'Inventario-descarga.exe');
  await descargar(url, nuevo);
  if (!fs.existsSync(nuevo) || fs.statSync(nuevo).size < 1024 * 1024) throw new Error('La descarga no se completó correctamente.');
  const ps1 = path.join(os.tmpdir(), 'inventario-actualizar.ps1');
  fs.writeFileSync(ps1, scriptActualizar(destino, nuevo));
  return ps1;
}

module.exports = { buscarNueva, descargarYPreparar, comparar, URL_RELEASE };
