const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buscarNueva, descargarYPreparar, comparar } = require('../lib/actualizador');

async function conServidorFalso(fn) {
  const srv = http.createServer((req, res) => {
    if (req.url === '/release') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        tag_name: 'v1.2.0',
        body: 'notas de la versión',
        assets: [{ name: 'Inventario.exe', browser_download_url: `http://127.0.0.1:${srv.address().port}/archivo` }],
      }));
    } else if (req.url === '/sin-asset') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ tag_name: 'v1.2.0', assets: [] }));
    } else if (req.url === '/redirige') {
      res.writeHead(302, { Location: `http://127.0.0.1:${srv.address().port}/release` });
      res.end();
    } else if (req.url === '/archivo') {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      res.end(Buffer.alloc(2 * 1024 * 1024, 7));
    } else if (req.url === '/chico') {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      res.end(Buffer.alloc(10, 1));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try { await fn(base); } finally { await new Promise((r) => srv.close(r)); }
}

test('actualizador: compara versiones, con o sin v, y con distinta cantidad de partes', () => {
  assert.equal(comparar('1.0.0', '1.0.0'), 0);
  assert.ok(comparar('1.2.0', '1.1.9') > 0);
  assert.ok(comparar('1.1.0', '1.2.0') < 0);
  assert.equal(comparar('1.0', '1.0.0'), 0);
  assert.ok(comparar('v1.0.1', 'v1.0.0') > 0);
  assert.ok(comparar('2.0.0', '1.9.9') > 0);
});

test('actualizador: buscarNueva detecta versión más nueva y trae la URL del asset', async () => {
  await conServidorFalso(async (base) => {
    const info = await buscarNueva('1.0.0', base + '/release');
    assert.equal(info.version, '1.2.0');
    assert.equal(info.url, base + '/archivo');
    assert.equal(info.notas, 'notas de la versión');
  });
});

test('actualizador: buscarNueva no avisa si la versión instalada ya es igual o mayor', async () => {
  await conServidorFalso(async (base) => {
    assert.equal(await buscarNueva('1.2.0', base + '/release'), null);
    assert.equal(await buscarNueva('2.0.0', base + '/release'), null);
  });
});

test('actualizador: buscarNueva sigue una redirección y no avisa si falta el asset', async () => {
  await conServidorFalso(async (base) => {
    const info = await buscarNueva('1.0.0', base + '/redirige');
    assert.equal(info.version, '1.2.0');
    assert.equal(await buscarNueva('1.0.0', base + '/sin-asset'), null);
  });
});

test('actualizador: descargarYPreparar exige la variable de entorno de la versión portátil', async () => {
  const antes = process.env.PORTABLE_EXECUTABLE_FILE;
  delete process.env.PORTABLE_EXECUTABLE_FILE;
  await assert.rejects(() => descargarYPreparar('http://127.0.0.1:1/archivo'), /versión portátil/);
  if (antes !== undefined) process.env.PORTABLE_EXECUTABLE_FILE = antes;
});

test('actualizador: descarga el archivo y arma el script que lo reemplaza y reinicia', async () => {
  await conServidorFalso(async (base) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inv-upd-'));
    const destino = path.join(dir, 'Inventario.exe');
    fs.writeFileSync(destino, 'version vieja');
    process.env.PORTABLE_EXECUTABLE_FILE = destino;
    try {
      const ps1 = await descargarYPreparar(base + '/archivo');
      const contenido = fs.readFileSync(ps1, 'utf8');
      assert.match(contenido, /Copy-Item -Path \$src -Destination \$dest -Force/);
      assert.match(contenido, /Start-Process -FilePath \$dest/);
      assert.ok(contenido.includes(destino.replace(/'/g, "''")));
      fs.rmSync(ps1, { force: true });
    } finally {
      delete process.env.PORTABLE_EXECUTABLE_FILE;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

test('actualizador: rechaza cuando la descarga viene incompleta o corrupta', async () => {
  await conServidorFalso(async (base) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inv-upd-'));
    process.env.PORTABLE_EXECUTABLE_FILE = path.join(dir, 'Inventario.exe');
    try {
      await assert.rejects(() => descargarYPreparar(base + '/chico'), /no se completó/);
    } finally {
      delete process.env.PORTABLE_EXECUTABLE_FILE;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
