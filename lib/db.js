const { DatabaseSync } = require('node:sqlite');
const { EventEmitter } = require('node:events');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const { CLAVES } = require('./campos');
const { canonizarEntrada } = require('./normalizar');

const COLS_SQL = CLAVES.map((c) => `${c} TEXT NOT NULL DEFAULT ''`).join(',\n  ');

class ConflictoVersion extends Error {
  constructor(actual) {
    super('El registro fue modificado por otro usuario');
    this.name = 'ConflictoVersion';
    this.actual = actual;
  }
}

class Inventario extends EventEmitter {
  constructor(archivo) {
    super();
    this.archivo = archivo;
    if (archivo !== ':memory:') fs.mkdirSync(path.dirname(archivo), { recursive: true });
    this.db = new DatabaseSync(archivo);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS activos (
        id TEXT PRIMARY KEY,
        orden REAL NOT NULL,
        ${COLS_SQL},
        version INTEGER NOT NULL DEFAULT 1,
        eliminado INTEGER NOT NULL DEFAULT 0,
        origen TEXT NOT NULL DEFAULT 'manual',
        creado_por TEXT NOT NULL DEFAULT '',
        creado_en INTEGER NOT NULL,
        actualizado_por TEXT NOT NULL DEFAULT '',
        actualizado_en INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS ix_activos_orden ON activos(orden);
      CREATE TABLE IF NOT EXISTS historial (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        activo_id TEXT,
        ts INTEGER NOT NULL,
        usuario TEXT NOT NULL DEFAULT '',
        accion TEXT NOT NULL,
        detalle TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS ix_hist_activo ON historial(activo_id);
      CREATE TABLE IF NOT EXISTS ajustes (clave TEXT PRIMARY KEY, valor TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS ignorados (clave TEXT PRIMARY KEY, por TEXT NOT NULL DEFAULT '', ts INTEGER NOT NULL);
    `);
    const columnas = this.db.prepare('PRAGMA table_info(activos)').all().map((c) => c.name);
    if (!columnas.includes('origen')) this.db.exec("ALTER TABLE activos ADD COLUMN origen TEXT NOT NULL DEFAULT 'manual'");
    this._rev = Number(this.ajuste('rev') || 0);
  }

  _renumerar() {
    const ids = this.db.prepare('SELECT id FROM activos ORDER BY orden, creado_en, id').all();
    const upd = this.db.prepare('UPDATE activos SET orden = ? WHERE id = ?');
    ids.forEach((r, i) => upd.run(i + 1, r.id));
  }

  _ordenTras(id) {
    const siguiente = (base) => this.db.prepare('SELECT MIN(orden) AS o FROM activos WHERE orden > ?').get(base).o;
    let a = this.obtener(id);
    let sig = siguiente(a.orden);
    if (sig !== null && sig - a.orden < 1e-6) {
      this._renumerar();
      a = this.obtener(id);
      sig = siguiente(a.orden);
    }
    return sig === null ? a.orden + 1 : (a.orden + sig) / 2;
  }

  ajuste(clave, def = null) {
    const r = this.db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(clave);
    return r ? r.valor : def;
  }
  setAjuste(clave, valor) {
    this.db.prepare('INSERT INTO ajustes(clave, valor) VALUES(?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor').run(clave, String(valor));
  }
  ajustes() {
    const o = {};
    for (const r of this.db.prepare('SELECT clave, valor FROM ajustes').all()) o[r.clave] = r.valor;
    return o;
  }

  get rev() { return this._rev; }
  _subirRev() {
    this._rev += 1;
    this.setAjuste('rev', this._rev);
  }
  _tx(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const r = fn();
      this.db.exec('COMMIT');
      return r;
    } catch (e) {
      try { this.db.exec('ROLLBACK'); } catch (_) { }
      throw e;
    }
  }
  _hist(activoId, usuario, accion, detalle) {
    this.db.prepare('INSERT INTO historial(activo_id, ts, usuario, accion, detalle) VALUES(?,?,?,?,?)')
      .run(activoId, Date.now(), usuario || '', accion, typeof detalle === 'string' ? detalle : JSON.stringify(detalle));
  }

  listar({ eliminados = false } = {}) {
    return this.db.prepare('SELECT * FROM activos WHERE eliminado = ? ORDER BY orden, creado_en, id').all(eliminados ? 1 : 0);
  }
  obtener(id) {
    return this.db.prepare('SELECT * FROM activos WHERE id = ?').get(id) || null;
  }
  total() {
    return this.db.prepare('SELECT COUNT(*) AS n FROM activos WHERE eliminado = 0').get().n;
  }
  valoresExistentes() {
    const o = {};
    for (const c of ['categoria', 'nomenclatura', 'descripcion', 'proveedor', 'tipo', 'ubicacion', 'responsable', 'marca', 'modelo', 'departamento']) {
      o[c] = this.db.prepare(`SELECT ${c} AS v, COUNT(*) AS n FROM activos WHERE eliminado = 0 AND ${c} <> '' GROUP BY ${c} ORDER BY n DESC`).all().map((r) => r.v);
    }
    return o;
  }

  _limpiar(datos) {
    const r = {};
    for (const c of CLAVES) {
      if (datos[c] === undefined || datos[c] === null) continue;
      r[c] = String(datos[c]).slice(0, 500);
    }
    return canonizarEntrada(r, this.valoresExistentes());
  }

  crear(datos, usuario, { despuesDe = null } = {}) {
    const d = this._limpiar(datos);
    return this._tx(() => {
      let orden;
      let ref = despuesDe || null;
      if (!ref) {
        const propia = this.db.prepare("SELECT id FROM activos WHERE creado_por = ? AND origen = 'manual' AND eliminado = 0 ORDER BY orden DESC, creado_en DESC LIMIT 1").get(usuario || '');
        if (propia) ref = propia.id;
      }
      if (ref && this.obtener(ref)) orden = this._ordenTras(ref);
      if (orden === undefined) orden = (this.db.prepare('SELECT MAX(orden) AS o FROM activos').get().o || 0) + 1;
      const id = crypto.randomUUID();
      const ahora = Date.now();
      const cols = CLAVES.filter((c) => d[c] !== undefined);
      const todas = ['id', 'orden', ...cols, 'creado_por', 'creado_en', 'actualizado_por', 'actualizado_en'];
      this.db.prepare(`INSERT INTO activos(${todas.join(',')}) VALUES(${todas.map(() => '?').join(',')})`)
        .run(id, orden, ...cols.map((c) => d[c]), usuario || '', ahora, usuario || '', ahora);
      this._hist(id, usuario, 'crear', d);
      this._subirRev();
      const fila = this.obtener(id);
      this.emit('cambio', { tipo: 'crear', ids: [id], usuario });
      return fila;
    });
  }

  actualizar(id, datos, usuario, versionEsperada) {
    const d = this._limpiar(datos);
    return this._tx(() => {
      const actual = this.obtener(id);
      if (!actual) throw new Error('El registro no existe');
      if (versionEsperada !== undefined && versionEsperada !== null && Number(versionEsperada) !== actual.version) {
        throw new ConflictoVersion(actual);
      }
      const cambios = {};
      for (const c of CLAVES) {
        if (d[c] !== undefined && d[c] !== actual[c]) cambios[c] = { antes: actual[c], despues: d[c] };
      }
      const claves = Object.keys(cambios);
      if (!claves.length) return actual;
      this.db.prepare(
        `UPDATE activos SET ${claves.map((c) => `${c} = ?`).join(', ')}, version = version + 1, actualizado_por = ?, actualizado_en = ? WHERE id = ?`
      ).run(...claves.map((c) => cambios[c].despues), usuario || '', Date.now(), id);
      this._hist(id, usuario, 'editar', cambios);
      this._subirRev();
      this.emit('cambio', { tipo: 'editar', ids: [id], usuario });
      return this.obtener(id);
    });
  }

  actualizarLote(ids, datos, usuario) {
    const d = this._limpiar(datos);
    const claves = CLAVES.filter((c) => d[c] !== undefined);
    if (!claves.length) return [];
    return this._tx(() => {
      const tocados = [];
      for (const id of ids) {
        const actual = this.obtener(id);
        if (!actual || actual.eliminado) continue;
        const cambios = {};
        for (const c of claves) if (d[c] !== actual[c]) cambios[c] = { antes: actual[c], despues: d[c] };
        const ck = Object.keys(cambios);
        if (!ck.length) continue;
        this.db.prepare(
          `UPDATE activos SET ${ck.map((c) => `${c} = ?`).join(', ')}, version = version + 1, actualizado_por = ?, actualizado_en = ? WHERE id = ?`
        ).run(...ck.map((c) => cambios[c].despues), usuario || '', Date.now(), id);
        this._hist(id, usuario, 'editar (lote)', cambios);
        tocados.push(id);
      }
      if (tocados.length) {
        this._subirRev();
        this.emit('cambio', { tipo: 'lote', ids: tocados, usuario });
      }
      return tocados;
    });
  }

  actualizarVarios(items, usuario) {
    return this._tx(() => {
      const tocados = [];
      for (const it of items) {
        const actual = this.obtener(it.id);
        if (!actual || actual.eliminado) continue;
        const d = this._limpiar(it.datos || {});
        const cambios = {};
        for (const c of CLAVES) if (d[c] !== undefined && d[c] !== actual[c]) cambios[c] = { antes: actual[c], despues: d[c] };
        const ck = Object.keys(cambios);
        if (!ck.length) continue;
        this.db.prepare(
          `UPDATE activos SET ${ck.map((c) => `${c} = ?`).join(', ')}, version = version + 1, actualizado_por = ?, actualizado_en = ? WHERE id = ?`
        ).run(...ck.map((c) => cambios[c].despues), usuario || '', Date.now(), it.id);
        this._hist(it.id, usuario, 'editar (lote)', cambios);
        tocados.push(it.id);
      }
      if (tocados.length) {
        this._subirRev();
        this.emit('cambio', { tipo: 'lote', ids: tocados, usuario });
      }
      return tocados;
    });
  }

  eliminar(ids, usuario) {
    const lista = Array.isArray(ids) ? ids : [ids];
    return this._tx(() => {
      const hechos = [];
      for (const id of lista) {
        const r = this.db.prepare('UPDATE activos SET eliminado = 1, version = version + 1, actualizado_por = ?, actualizado_en = ? WHERE id = ? AND eliminado = 0')
          .run(usuario || '', Date.now(), id);
        if (r.changes) { this._hist(id, usuario, 'eliminar', ''); hechos.push(id); }
      }
      if (hechos.length) {
        this._subirRev();
        this.emit('cambio', { tipo: 'eliminar', ids: hechos, usuario });
      }
      return hechos;
    });
  }

  restaurar(ids, usuario) {
    const lista = Array.isArray(ids) ? ids : [ids];
    return this._tx(() => {
      const hechos = [];
      for (const id of lista) {
        const r = this.db.prepare('UPDATE activos SET eliminado = 0, version = version + 1, actualizado_por = ?, actualizado_en = ? WHERE id = ? AND eliminado = 1')
          .run(usuario || '', Date.now(), id);
        if (r.changes) { this._hist(id, usuario, 'restaurar', ''); hechos.push(id); }
      }
      if (hechos.length) {
        this._subirRev();
        this.emit('cambio', { tipo: 'restaurar', ids: hechos, usuario });
      }
      return hechos;
    });
  }

  importar(filas, usuario, { reemplazar = false } = {}) {
    return this._tx(() => {
      const ahora = Date.now();
      if (reemplazar) {
        this.db.prepare('UPDATE activos SET eliminado = 1, version = version + 1, actualizado_por = ?, actualizado_en = ? WHERE eliminado = 0').run(usuario || '', ahora);
      }
      let orden = this.db.prepare('SELECT MAX(orden) AS o FROM activos').get().o || 0;
      const ins = this.db.prepare(
        `INSERT INTO activos(id, orden, ${CLAVES.join(',')}, origen, creado_por, creado_en, actualizado_por, actualizado_en)
         VALUES(?, ?, ${CLAVES.map(() => '?').join(',')}, 'importado', ?, ?, ?, ?)`
      );
      for (const f of filas) {
        orden += 1;
        ins.run(crypto.randomUUID(), orden, ...CLAVES.map((c) => String(f[c] ?? '')), usuario || '', ahora, usuario || '', ahora);
      }
      this._hist(null, usuario, 'importar', { filas: filas.length, reemplazar });
      this._subirRev();
      this.emit('cambio', { tipo: 'importar', ids: [], usuario });
      return filas.length;
    });
  }

  reiniciar(usuario) {
    return this._tx(() => {
      this.db.exec('DELETE FROM activos; DELETE FROM historial; DELETE FROM ignorados;');
      this._hist(null, usuario, 'reiniciar', '');
      this._subirRev();
      this.emit('cambio', { tipo: 'reiniciar', ids: [], usuario });
    });
  }

  historial(activoId, limite = 100) {
    return this.db.prepare('SELECT * FROM historial WHERE activo_id = ? ORDER BY id DESC LIMIT ?').all(activoId, limite);
  }

  ignorados() {
    return this.db.prepare('SELECT clave FROM ignorados').all().map((r) => r.clave);
  }
  ignorar(clave, usuario) {
    this.db.prepare('INSERT OR REPLACE INTO ignorados(clave, por, ts) VALUES(?,?,?)').run(clave, usuario || '', Date.now());
    this._subirRev();
    this.emit('cambio', { tipo: 'ignorados', ids: [], usuario });
  }
  quitarIgnorado(clave, usuario) {
    this.db.prepare('DELETE FROM ignorados WHERE clave = ?').run(clave);
    this._subirRev();
    this.emit('cambio', { tipo: 'ignorados', ids: [], usuario });
  }

  copiarA(destino) {
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    if (fs.existsSync(destino)) fs.unlinkSync(destino);
    this.db.exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
  }

  cerrar() {
    try { this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch (_) { }
    this.db.close();
  }
}

module.exports = { Inventario, ConflictoVersion };
