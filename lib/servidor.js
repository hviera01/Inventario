const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const QRCode = require('qrcode');
const { ConflictoVersion } = require('./db');
const { importarExcel, generarExcel } = require('./excel');
const { respaldoDelDia, snapshotLocal, snapshotForzado, respaldadoHoy, titulos } = require('./respaldos');
const red = require('./red');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
};

const LIMITE_JSON = 2 * 1024 * 1024;
const LIMITE_XLSX = 30 * 1024 * 1024;

function leerCuerpo(req, limite) {
  return new Promise((resolve, reject) => {
    const partes = [];
    let n = 0;
    req.on('data', (c) => {
      n += c.length;
      if (n > limite) { reject(Object.assign(new Error('Archivo demasiado grande'), { codigo: 413 })); req.destroy(); return; }
      partes.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(partes)));
    req.on('error', reject);
  });
}

function crearServidor({ db, dirDatos, dirPublico, puerto = 47800, version = '1.0.0', elegirCarpeta = null, forzarRemoto = false, intervaloRespaldo = 20 * 60 * 1000, esperaRespaldoInicial = 15 * 1000 }) {
  if (!db.ajuste('secreto')) db.setAjuste('secreto', crypto.randomBytes(32).toString('hex'));
  if (!db.ajuste('pin')) db.setAjuste('pin', String(crypto.randomInt(0, 10000)).padStart(4, '0'));
  const firmar = (t) => crypto.createHmac('sha256', db.ajuste('secreto')).update(t).digest('hex');
  const tokenOk = () => { const t = String(Date.now()); return `${t}.${firmar(t)}`; };
  const verificarToken = (tok) => {
    if (!tok) return false;
    const [t, sig] = String(tok).split('.');
    if (!t || !sig) return false;
    const esperado = firmar(t);
    const a = Buffer.from(sig), b = Buffer.from(esperado);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  };
  const cookieDe = (req) => {
    const m = /(?:^|;\s*)inv=([^;]+)/.exec(req.headers.cookie || '');
    return m ? decodeURIComponent(m[1]) : '';
  };

  const propias = () => new Set(red.ipsLocales().map((i) => i.ip));
  const esLocal = (req) => {
    if (forzarRemoto) return false;
    const a = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
    return a === '127.0.0.1' || a === '::1' || propias().has(a);
  };

  const fallos = new Map();
  const bloqueado = (ip) => { const f = fallos.get(ip); return f && f.hasta > Date.now(); };
  const registrarFallo = (ip) => {
    const f = fallos.get(ip) || { n: 0, hasta: 0 };
    f.n += 1;
    if (f.n >= 6) { f.hasta = Date.now() + 5 * 60 * 1000; f.n = 0; }
    fallos.set(ip, f);
  };

  const clientes = new Map();
  const enviar = (res, evento, datos) => { try { res.write(`event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`); } catch (_) { } };
  const presencia = () => [...clientes.entries()].map(([cid, c]) => ({ cid, nombre: c.nombre, editando: c.editando }));
  const difundir = (evento, datos) => { for (const c of clientes.values()) enviar(c.res, evento, datos); };
  db.on('cambio', (e) => difundir('cambio', { ...e, rev: db.rev }));

  const latido = setInterval(() => {
    for (const c of clientes.values()) { try { c.res.write(': ♥\n\n'); } catch (_) { } }
  }, 15000);

  const json = (res, codigo, obj) => {
    const cuerpo = JSON.stringify(obj);
    res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(cuerpo) });
    res.end(cuerpo);
  };

  const filaPublica = (f) => f;

  function resumenCambios(cambios) {
    const m = new Map();
    for (const c of cambios) {
      const k = `${c.campo}\u0000${c.antes}\u0000${c.despues}`;
      if (!m.has(k)) m.set(k, { campo: c.campo, antes: c.antes, despues: c.despues, n: 0 });
      m.get(k).n += 1;
    }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }

  async function api(req, res, url) {
    const ruta = url.pathname;
    const metodo = req.method;
    const usuario = decodeURIComponent(req.headers['x-usuario'] || '') || 'Sin nombre';
    const local = esLocal(req);
    const ipCliente = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');

    if (ruta === '/api/hola') return json(res, 200, { app: 'inventario', version, nombrePc: require('node:os').hostname() });

    if (ruta === '/api/sesion') {
      return json(res, 200, { autenticado: local || verificarToken(cookieDe(req)), local, version });
    }
    if (ruta === '/api/login' && metodo === 'POST') {
      if (bloqueado(ipCliente)) return json(res, 429, { error: 'Demasiados intentos. Intente nuevamente en unos minutos.' });
      const { pin } = JSON.parse((await leerCuerpo(req, LIMITE_JSON)).toString() || '{}');
      if (String(pin || '').trim() !== db.ajuste('pin')) { registrarFallo(ipCliente); return json(res, 401, { error: 'PIN incorrecto' }); }
      fallos.delete(ipCliente);
      res.setHeader('Set-Cookie', `inv=${encodeURIComponent(tokenOk())}; Path=/; Max-Age=${60 * 60 * 24 * 90}; HttpOnly; SameSite=Lax`);
      return json(res, 200, { ok: true });
    }

    if (!local && !verificarToken(cookieDe(req))) return json(res, 401, { error: 'No autenticado' });

    if (ruta === '/api/datos' && metodo === 'GET') {
      const a = db.ajustes();
      return json(res, 200, {
        rev: db.rev,
        activos: db.listar().map(filaPublica),
        ignorados: db.ignorados(),
        existentes: db.valoresExistentes(),
        ajustes: { titulo1: a.titulo1 || '', titulo2: a.titulo2 || '', ultimoRespaldo: Number(a.ultimoRespaldo || 0), carpetaRespaldo: a.carpetaRespaldo || '', modoPrueba: a.modoPrueba === '1', modoDefinido: a.modoPrueba !== undefined },
        presencia: presencia(),
        local,
      });
    }

    if (ruta === '/api/activos' && metodo === 'POST') {
      const { datos, despuesDe } = JSON.parse((await leerCuerpo(req, LIMITE_JSON)).toString());
      return json(res, 201, db.crear(datos || {}, usuario, { despuesDe }));
    }
    let m = /^\/api\/activos\/([0-9a-f-]{36})$/.exec(ruta);
    if (m && metodo === 'PUT') {
      const { datos, version: v } = JSON.parse((await leerCuerpo(req, LIMITE_JSON)).toString());
      try { return json(res, 200, db.actualizar(m[1], datos || {}, usuario, v)); } catch (e) {
        if (e instanceof ConflictoVersion) return json(res, 409, { error: e.message, actual: e.actual });
        throw e;
      }
    }
    if (ruta === '/api/activos/eliminar' && metodo === 'POST') {
      const { ids } = JSON.parse((await leerCuerpo(req, LIMITE_JSON)).toString());
      return json(res, 200, { ids: db.eliminar(ids || [], usuario) });
    }
    if (ruta === '/api/activos/restaurar' && metodo === 'POST') {
      const { ids } = JSON.parse((await leerCuerpo(req, LIMITE_JSON)).toString());
      return json(res, 200, { ids: db.restaurar(ids || [], usuario) });
    }
    if (ruta === '/api/activos/lote' && metodo === 'POST') {
      const { ids, datos } = JSON.parse((await leerCuerpo(req, LIMITE_JSON)).toString());
      return json(res, 200, { ids: db.actualizarLote(ids || [], datos || {}, usuario) });
    }
    if (ruta === '/api/activos/varios' && metodo === 'POST') {
      const { items } = JSON.parse((await leerCuerpo(req, LIMITE_JSON)).toString());
      return json(res, 200, { ids: db.actualizarVarios(Array.isArray(items) ? items : [], usuario) });
    }
    if (ruta === '/api/papelera') return json(res, 200, { activos: db.listar({ eliminados: true }).sort((a, b) => b.actualizado_en - a.actualizado_en).slice(0, 500) });
    m = /^\/api\/historial\/([0-9a-f-]{36})$/.exec(ruta);
    if (m) return json(res, 200, { historial: db.historial(m[1]) });

    if (ruta === '/api/ignorados' && metodo === 'POST') {
      const { clave, ignorar } = JSON.parse((await leerCuerpo(req, LIMITE_JSON)).toString());
      if (ignorar) db.ignorar(clave, usuario); else db.quitarIgnorado(clave, usuario);
      return json(res, 200, { ok: true });
    }

    if (ruta === '/api/edicion' && metodo === 'POST') {
      const { cid, id } = JSON.parse((await leerCuerpo(req, LIMITE_JSON)).toString());
      const c = clientes.get(cid);
      if (c) { c.editando = id || null; difundir('presencia', presencia()); }
      return json(res, 200, { ok: true });
    }

    if (ruta === '/api/exportar' && metodo === 'POST') {
      const { ids } = JSON.parse((await leerCuerpo(req, LIMITE_JSON)).toString() || '{}');
      let filas = db.listar();
      if (Array.isArray(ids)) { const s = new Set(ids); filas = filas.filter((f) => s.has(f.id)); }
      const buf = await generarExcel(filas, titulos(db));
      const nombre = `Inventario de Hardware_${require('./respaldos').hoy()}.xlsx`;
      res.writeHead(200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Inventario.xlsx"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
        'Content-Length': buf.length, 'Cache-Control': 'no-store',
      });
      return res.end(buf);
    }
    if (ruta === '/api/importar' && metodo === 'POST') {
      const buf = await leerCuerpo(req, LIMITE_XLSX);
      const soloVista = url.searchParams.get('vista') === '1';
      const reemplazar = url.searchParams.get('reemplazar') === '1';
      const imp = await importarExcel(buf);
      if (soloVista) {
        return json(res, 200, { filas: imp.filas.length, cambios: imp.cambios.length, resumen: resumenCambios(imp.cambios).slice(0, 200), actuales: db.total(), titulo1: imp.titulo1, titulo2: imp.titulo2 });
      }
      if (db.total() > 0 && !reemplazar) return json(res, 409, { error: 'La base ya contiene datos. Confirme el reemplazo para continuar.' });
      try { snapshotLocal(db, dirDatos); } catch (_) { }
      db.importar(imp.filas, usuario, { reemplazar });
      if (url.searchParams.has('prueba')) db.setAjuste('modoPrueba', url.searchParams.get('prueba') === '1' ? '1' : '0');
      if (imp.titulo1) db.setAjuste('titulo1', imp.titulo1);
      if (imp.titulo2) db.setAjuste('titulo2', imp.titulo2);
      return json(res, 200, { filas: imp.filas.length, resumen: resumenCambios(imp.cambios).slice(0, 200) });
    }
    if (ruta === '/api/reiniciar' && metodo === 'POST') {
      if (!local) return json(res, 403, { error: 'Disponible solo en el equipo servidor' });
      const { modo } = JSON.parse((await leerCuerpo(req, LIMITE_JSON)).toString() || '{}');
      const copia = snapshotForzado(db, dirDatos, 'antes-de-reiniciar');
      db.reiniciar(usuario);
      db.setAjuste('modoPrueba', modo === 'prueba' ? '1' : '0');
      db.emit('cambio', { tipo: 'ajustes', ids: [], usuario });
      return json(res, 200, { ok: true, copia });
    }
    if (ruta === '/api/respaldo' && metodo === 'POST') {
      try { return json(res, 200, await respaldoDelDia(db)); } catch (e) { return json(res, 400, { error: e.message }); }
    }
    if (ruta === '/api/ajustes' && metodo === 'POST') {
      const a = JSON.parse((await leerCuerpo(req, LIMITE_JSON)).toString());
      for (const k of ['titulo1', 'titulo2']) if (typeof a[k] === 'string') db.setAjuste(k, a[k].slice(0, 300));
      if (local && typeof a.carpetaRespaldo === 'string') db.setAjuste('carpetaRespaldo', a.carpetaRespaldo);
      if (local && /^\d{4,8}$/.test(String(a.pin || ''))) { db.setAjuste('pin', String(a.pin)); db.setAjuste('secreto', crypto.randomBytes(32).toString('hex')); }
      db.emit('cambio', { tipo: 'ajustes', ids: [], usuario });
      return json(res, 200, { ok: true });
    }
    if (ruta === '/api/elegir-carpeta' && metodo === 'POST') {
      if (!local || !elegirCarpeta) return json(res, 403, { error: 'Disponible solo en el equipo servidor' });
      const c = await elegirCarpeta();
      if (c) { db.setAjuste('carpetaRespaldo', c); db.emit('cambio', { tipo: 'ajustes', ids: [], usuario }); }
      return json(res, 200, { carpeta: c || db.ajuste('carpetaRespaldo', '') });
    }

    if (ruta === '/api/conexion') {
      if (!local) return json(res, 403, { error: 'Disponible solo en el equipo servidor' });
      const ips = red.ipsLocales();
      const lista = ips.map((i) => ({ ...i, url: `http://${i.ip}:${puerto}` }));
      const principal = lista[0] ? lista[0].url : `http://localhost:${puerto}`;
      const qr = await QRCode.toString(principal, { type: 'svg', margin: 1, width: 200 });
      const nombrePc = require('node:os').hostname();
      const urlNombre = /^[A-Za-z0-9-]+$/.test(nombrePc) ? `http://${nombrePc}.local:${puerto}` : null;
      const qrNombre = urlNombre ? await QRCode.toString(urlNombre, { type: 'svg', margin: 1, width: 200 }) : null;
      return json(res, 200, {
        puerto, pin: db.ajuste('pin'), redes: lista, principal, qr,
        nombrePc, urlNombre, qrNombre, firewall: await red.reglaFirewallExiste(),
      });
    }
    if (ruta === '/api/firewall' && metodo === 'POST') {
      if (!local) return json(res, 403, { error: 'Disponible solo en el equipo servidor' });
      return json(res, 200, { ok: await red.permitirFirewall(puerto) });
    }

    return json(res, 404, { error: 'No existe' });
  }

  function estatico(req, res, url) {
    let p = decodeURIComponent(url.pathname);
    if (p === '/') p = '/index.html';
    const archivo = path.normalize(path.join(dirPublico, p));
    let permitido = archivo.startsWith(path.normalize(dirPublico + path.sep));
    let f = archivo;
    if (p === '/campos.js' || p === '/busqueda.js') { f = path.join(__dirname, p.slice(1)); permitido = true; }
    if (!permitido || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end('No encontrado'); }
    const ext = path.extname(f);
    const cache = ext === '.woff2' || ext === '.png' ? 'public, max-age=604800' : 'no-store';
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': cache });
    fs.createReadStream(f).pipe(res);
  }

  const servidor = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      if (url.pathname === '/api/eventos') {
        if (!esLocal(req) && !verificarToken(cookieDe(req))) { res.writeHead(401); return res.end(); }
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        const cid = url.searchParams.get('cid') || crypto.randomUUID();
        const nombre = (url.searchParams.get('nombre') || 'Sin nombre').slice(0, 40);
        clientes.set(cid, { res, nombre, editando: null });
        enviar(res, 'hola', { cid, rev: db.rev });
        difundir('presencia', presencia());
        req.on('close', () => { clientes.delete(cid); difundir('presencia', presencia()); });
        return;
      }
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);
      return estatico(req, res, url);
    } catch (e) {
      const codigo = e.codigo || 500;
      if (!res.headersSent) json(res, codigo, { error: e.message || 'Error' });
      else res.end();
      if (codigo === 500) console.error('[servidor]', e);
    }
  });

  async function revisarRespaldoAutomatico() {
    try { snapshotLocal(db, dirDatos); } catch (e) { console.error('[snapshot]', e.message); }
    if (!db.ajuste('carpetaRespaldo') || respaldadoHoy(db)) return;
    try { await respaldoDelDia(db); } catch (e) { console.error('[respaldo automático]', e.message); }
  }
  const timerSnap = setInterval(revisarRespaldoAutomatico, intervaloRespaldo);
  const timerRespaldoInicial = setTimeout(revisarRespaldoAutomatico, esperaRespaldoInicial);

  return {
    servidor,
    puerto,
    escuchar() {
      return new Promise((resolve, reject) => {
        let intento = 0;
        const probar = (p) => {
          servidor.once('error', (e) => {
            if (e.code === 'EADDRINUSE' && intento < 10) { intento += 1; probar(p + 1); } else reject(e);
          });
          servidor.listen(p, '0.0.0.0', () => { this.puerto = p; puerto = p; resolve(p); });
        };
        probar(puerto);
      });
    },
    cerrar() {
      clearInterval(latido); clearInterval(timerSnap); clearTimeout(timerRespaldoInicial);
      for (const c of clientes.values()) { try { c.res.end(); } catch (_) { } }
      return new Promise((r) => { servidor.close(() => r()); servidor.closeAllConnections?.(); });
    },
    respaldadoHoy: () => respaldadoHoy(db),
  };
}

module.exports = { crearServidor };
