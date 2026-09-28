const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Inventario } = require('../lib/db');
const { crearServidor } = require('../lib/servidor');
const { generarExcel } = require('../lib/excel');
const { CLAVES } = require('../lib/campos');

const vacia = () => Object.fromEntries(CLAVES.map((c) => [c, '']));

async function levantar(opciones = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inv-'));
  const db = new Inventario(path.join(dir, 'inventario.db'));
  const srv = crearServidor({ db, dirDatos: dir, dirPublico: path.join(__dirname, '..', 'public'), puerto: 47950, ...opciones });
  const puerto = await srv.escuchar();
  const base = `http://127.0.0.1:${puerto}`;
  const api = async (metodo, ruta, cuerpo, cab = {}) => {
    const r = await fetch(base + ruta, {
      method: metodo,
      headers: { Connection: 'close', 'X-Usuario': encodeURIComponent('Prueba'), ...(cuerpo !== undefined && !(cuerpo instanceof Buffer) ? { 'Content-Type': 'application/json' } : {}), ...cab },
      body: cuerpo === undefined ? undefined : cuerpo instanceof Buffer ? cuerpo : JSON.stringify(cuerpo),
    });
    const tipo = r.headers.get('content-type') || '';
    return { status: r.status, data: tipo.includes('json') ? await r.json() : await r.arrayBuffer(), headers: r.headers };
  };
  const cerrar = async () => { await srv.cerrar(); db.cerrar(); fs.rmSync(dir, { recursive: true, force: true }); };
  return { db, srv, base, api, dir, cerrar };
}

test('servidor: hola, estáticos y compartidos', async () => {
  const s = await levantar();
  try {
    const h = await s.api('GET', '/api/hola');
    assert.equal(h.data.app, 'inventario');
    for (const ruta of ['/', '/estilos.css', '/app.js', '/campos.js', '/busqueda.js', '/fuentes/geist-latin-wght-normal.woff2', '/manifest.webmanifest', '/apple-touch-icon.png']) {
      const r = await fetch(s.base + ruta, { headers: { Connection: 'close' } });
      assert.equal(r.status, 200, ruta);
    }
    assert.equal((await fetch(s.base + '/../package.json', { headers: { Connection: 'close' } })).status, 404);
    assert.equal((await fetch(s.base + '/%2e%2e/package.json', { headers: { Connection: 'close' } })).status, 404);
  } finally { await s.cerrar(); }
});

test('servidor: CRUD, conflicto de versión, papelera y lote', async () => {
  const s = await levantar();
  try {
    const c = await s.api('POST', '/api/activos', { datos: { descripcion: 'Desktop', nombre: 'PC1', marca: 'dell', mac: 'aa0011223302' } });
    assert.equal(c.status, 201);
    assert.equal(c.data.marca, 'DELL');
    assert.equal(c.data.mac, 'AA:00:11:22:33:02');
    const id = c.data.id;
    const u = await s.api('PUT', `/api/activos/${id}`, { datos: { nombre: 'PC1-A' }, version: c.data.version });
    assert.equal(u.data.nombre, 'PC1-A');
    const viejo = await s.api('PUT', `/api/activos/${id}`, { datos: { nombre: 'PC1-B' }, version: c.data.version });
    assert.equal(viejo.status, 409);
    assert.equal(viejo.data.actual.nombre, 'PC1-A');
    const l = await s.api('POST', '/api/activos/lote', { ids: [id], datos: { ubicacion: 'Sur' } });
    assert.deepEqual(l.data.ids, [id]);
    const d = await s.api('GET', '/api/datos');
    assert.equal(d.data.activos.length, 1);
    assert.equal(d.data.activos[0].ubicacion, 'Sur');
    await s.api('POST', '/api/activos/eliminar', { ids: [id] });
    assert.equal((await s.api('GET', '/api/datos')).data.activos.length, 0);
    assert.equal((await s.api('GET', '/api/papelera')).data.activos.length, 1);
    await s.api('POST', '/api/activos/restaurar', { ids: [id] });
    assert.equal((await s.api('GET', '/api/datos')).data.activos.length, 1);
    const h = await s.api('GET', `/api/historial/${id}`);
    assert.ok(h.data.historial.length >= 4);
  } finally { await s.cerrar(); }
});

test('servidor: actualizar varias filas con valores distintos en una sola operación', async () => {
  const s = await levantar();
  try {
    const a = (await s.api('POST', '/api/activos', { datos: { nombre: 'A', departamento: 'Caja/Ana Perez' } })).data;
    const b = (await s.api('POST', '/api/activos', { datos: { nombre: 'B', departamento: 'Creditos/Luis Mora' } })).data;
    const r = await s.api('POST', '/api/activos/varios', { items: [
      { id: a.id, datos: { departamento: 'Caja', responsable: 'Ana Perez' } },
      { id: b.id, datos: { departamento: 'Creditos', responsable: 'Luis Mora' } },
      { id: '00000000-0000-0000-0000-000000000000', datos: { nombre: 'x' } },
    ] });
    assert.equal(r.status, 200);
    assert.equal(r.data.ids.length, 2);
    const d = (await s.api('GET', '/api/datos')).data.activos;
    assert.deepEqual(d.map((f) => [f.departamento, f.responsable]), [['Caja', 'Ana Perez'], ['Creditos', 'Luis Mora']]);
    assert.ok(s.db.historial(a.id).some((x) => x.accion === 'editar (lote)'));
  } finally { await s.cerrar(); }
});

test('servidor: marcar/quitar pendiente y reordenar por responsable', async () => {
  const s = await levantar();
  try {
    const a = (await s.api('POST', '/api/activos', { datos: { nombre: 'A', descripcion: 'Mouse', responsable: 'Allan', departamento: 'TI' } })).data;
    const b = (await s.api('POST', '/api/activos', { datos: { nombre: 'B', descripcion: 'Desktop', responsable: 'Allan', departamento: 'TI' } })).data;
    const marcado = await s.api('POST', '/api/activos/pendiente', { id: a.id, motivo: 'Falta confirmar MAC' });
    assert.equal(marcado.status, 200);
    assert.equal(marcado.data.pendiente, 1);
    assert.equal(marcado.data.motivo_pendiente, 'Falta confirmar MAC');
    const quitado = await s.api('POST', '/api/activos/pendiente/quitar', { id: a.id });
    assert.equal(quitado.data.pendiente, 0);
    const noExiste = await s.api('POST', '/api/activos/pendiente', { id: '00000000-0000-0000-0000-000000000000', motivo: 'x' });
    assert.equal(noExiste.status, 400);
    const reord = await s.api('POST', '/api/reordenar', {});
    assert.equal(reord.status, 200);
    assert.equal(reord.data.filas, 2);
    const orden = (await s.api('GET', '/api/datos')).data.activos.map((f) => f.nombre);
    assert.deepEqual(orden, ['B', 'A']);
  } finally { await s.cerrar(); }
});

test('servidor: importar (vista previa y real), modo prueba, exportar y reiniciar', async () => {
  const s = await levantar();
  try {
    const filas = [
      { ...vacia(), descripcion: 'Desktop', marca: 'Dell', modelo: 'Optiplex 3080', mac: 'aa-00-11-22-33-02', ubicacion: 'Oficina Principal', departamento: 'Caja/Ana Perez' },
      { ...vacia(), descripcion: 'Desktop', marca: 'DELL', modelo: 'OPTIPLEX 3080', mac: 'AA:BB:CC:DD:EE:FF', ubicacion: 'Oficina Principal' },
    ];
    const xlsx = await generarExcel(filas);
    const vista = await s.api('POST', '/api/importar?vista=1', xlsx);
    assert.equal(vista.data.filas, 2);
    assert.ok(vista.data.cambios >= 3);
    assert.equal((await s.api('GET', '/api/datos')).data.activos.length, 0);
    const real = await s.api('POST', '/api/importar?reemplazar=0&prueba=1', xlsx);
    assert.equal(real.data.filas, 2);
    const d = (await s.api('GET', '/api/datos')).data;
    assert.equal(d.ajustes.modoPrueba, true);
    assert.equal(d.activos[0].mac, 'AA:00:11:22:33:02');
    assert.equal(d.activos[0].departamento, 'Caja/Ana Perez');
    const otra = await s.api('POST', '/api/importar?reemplazar=0', xlsx);
    assert.equal(otra.status, 409);
    const ex = await s.api('POST', '/api/exportar', {});
    assert.equal(ex.status, 200);
    assert.equal(Buffer.from(ex.data).slice(0, 2).toString(), 'PK');
    const parcial = await s.api('POST', '/api/exportar', { ids: [d.activos[0].id] });
    assert.ok(parcial.status === 200);

    const r = await s.api('POST', '/api/reiniciar', { modo: 'real' });
    assert.equal(r.data.ok, true);
    assert.ok(fs.existsSync(r.data.copia));
    const d2 = (await s.api('GET', '/api/datos')).data;
    assert.equal(d2.activos.length, 0);
    assert.equal(d2.ajustes.modoPrueba, false);
    assert.equal(d2.ajustes.modoDefinido, true);
    const copia = new Inventario(r.data.copia);
    assert.equal(copia.total(), 2);
    copia.cerrar();
  } finally { await s.cerrar(); }
});

test('servidor: respaldo exige carpeta y genera Excel y base', async () => {
  const s = await levantar();
  try {
    await s.api('POST', '/api/activos', { datos: { nombre: 'X', descripcion: 'Y' } });
    const sin = await s.api('POST', '/api/respaldo', {});
    assert.equal(sin.status, 400);
    const carpeta = path.join(s.dir, 'drive');
    await s.api('POST', '/api/ajustes', { carpetaRespaldo: carpeta });
    s.db.setAjuste('modoPrueba', '1');
    const ok = await s.api('POST', '/api/respaldo', {});
    assert.equal(ok.status, 200);
    const archivos = fs.readdirSync(carpeta);
    assert.equal(archivos.length, 2);
    assert.ok(archivos.includes('Inventario de Hardware_PRUEBA.xlsx'));
    assert.ok(archivos.includes('inventario_PRUEBA.db'));
    assert.equal(s.srv.respaldadoHoy(), true);
    await s.api('POST', '/api/activos', { datos: { nombre: 'Z', descripcion: 'W' } });
    const otra = await s.api('POST', '/api/respaldo', {});
    assert.equal(otra.status, 200);
    assert.equal(fs.readdirSync(carpeta).length, 2);
  } finally { await s.cerrar(); }
});

test('servidor: eventos en tiempo real (SSE) y presencia', async () => {
  const s = await levantar();
  try {
    const ctl = new AbortController();
    const r = await fetch(`${s.base}/api/eventos?cid=aaa&nombre=Ana`, { signal: ctl.signal, headers: { Connection: 'close' } });
    const lector = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    const leerHasta = async (texto, ms = 3000) => {
      const fin = Date.now() + ms;
      while (!buf.includes(texto) && Date.now() < fin) {
        const p = await Promise.race([lector.read(), new Promise((res) => setTimeout(() => res(null), 300))]);
        if (p && p.value) buf += dec.decode(p.value);
      }
      return buf.includes(texto);
    };
    assert.ok(await leerHasta('event: hola'));
    assert.ok(await leerHasta('"nombre":"Ana"'));
    await s.api('POST', '/api/activos', { datos: { nombre: 'Z', descripcion: 'Z' } });
    assert.ok(await leerHasta('event: cambio'));
    await s.api('POST', '/api/edicion', { cid: 'aaa', id: 'x' });
    assert.ok(await leerHasta('"editando":"x"'));
    ctl.abort();
  } finally { await s.cerrar(); }
});

test('servidor remoto: exige PIN, limita intentos y protege las rutas', async () => {
  const s = await levantar({ forzarRemoto: true });
  try {
    assert.equal((await s.api('GET', '/api/datos')).status, 401);
    assert.equal((await s.api('GET', '/api/sesion')).data.autenticado, false);
    assert.equal((await s.api('GET', '/api/conexion')).status, 401);
    const mal = await s.api('POST', '/api/login', { pin: '0000x' });
    assert.equal(mal.status, 401);
    const pin = s.db.ajuste('pin');
    const bien = await s.api('POST', '/api/login', { pin });
    assert.equal(bien.status, 200);
    const cookie = bien.headers.get('set-cookie').split(';')[0];
    assert.ok(/HttpOnly/i.test(bien.headers.get('set-cookie')));
    assert.equal((await s.api('GET', '/api/datos', undefined, { Cookie: cookie })).status, 200);
    assert.equal((await s.api('GET', '/api/sesion', undefined, { Cookie: cookie })).data.autenticado, true);
    assert.equal((await s.api('GET', '/api/conexion', undefined, { Cookie: cookie })).status, 403);
    assert.equal((await s.api('POST', '/api/reiniciar', { modo: 'real' }, { Cookie: cookie })).status, 403);
    assert.equal((await s.api('GET', '/api/datos', undefined, { Cookie: 'inv=falso.firma' })).status, 401);
    for (let i = 0; i < 6; i++) await s.api('POST', '/api/login', { pin: '9999' });
    assert.equal((await s.api('POST', '/api/login', { pin })).status, 429);
  } finally { await s.cerrar(); }
});

test('servidor local: conexión y PIN de la PC servidor', async () => {
  const s = await levantar();
  try {
    const c = await s.api('GET', '/api/conexion');
    assert.equal(c.status, 200);
    assert.match(c.data.pin, /^\d{4}$/);
    assert.ok(c.data.qr.includes('<svg'));
    assert.ok(Array.isArray(c.data.redes));
    const cam = await s.api('POST', '/api/ajustes', { pin: '482913' });
    assert.equal(cam.status, 200);
    assert.equal((await s.api('GET', '/api/conexion')).data.pin, '482913');
  } finally { await s.cerrar(); }
});
