const fs = require('node:fs');
const path = require('node:path');
const { generarExcel } = require('./excel');

const pad = (n) => String(n).padStart(2, '0');
function sello(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}
function hoy(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function titulos(db) {
  const a = db.ajustes();
  const o = {};
  if (a.titulo1) o.titulo1 = a.titulo1;
  if (a.titulo2) o.titulo2 = a.titulo2;
  return o;
}

async function respaldoDelDia(db) {
  const carpeta = db.ajuste('carpetaRespaldo');
  if (!carpeta) throw new Error('Configure primero la carpeta de respaldo (Más › Respaldo y exportación).');
  fs.mkdirSync(carpeta, { recursive: true });
  const s = sello();
  const marca = db.ajuste('modoPrueba') === '1' ? '_PRUEBA' : '';
  const xlsx = path.join(carpeta, `Inventario de Hardware${marca}_${s}.xlsx`);
  const dbf = path.join(carpeta, `inventario${marca}_${s}.db`);
  fs.writeFileSync(xlsx, await generarExcel(db.listar(), titulos(db)));
  db.copiarA(dbf);
  db.setAjuste('ultimoRespaldo', Date.now());
  db.emit('cambio', { tipo: 'respaldo', ids: [], usuario: '' });
  return { carpeta, archivos: [path.basename(xlsx), path.basename(dbf)], ts: Date.now() };
}

function snapshotLocal(db, dirDatos, max = 40) {
  const dir = path.join(dirDatos, 'respaldos-automaticos');
  fs.mkdirSync(dir, { recursive: true });
  const marca = Number(db.ajuste('ultimoSnapshotRev', -1));
  if (marca === db.rev) return null;
  const destino = path.join(dir, `auto_${sello()}.db`);
  db.copiarA(destino);
  db.setAjuste('ultimoSnapshotRev', db.rev);
  const viejos = fs.readdirSync(dir).filter((f) => f.startsWith('auto_')).sort();
  while (viejos.length > max) fs.unlinkSync(path.join(dir, viejos.shift()));
  return destino;
}

function snapshotForzado(db, dirDatos, etiqueta) {
  const dir = path.join(dirDatos, 'respaldos-automaticos');
  fs.mkdirSync(dir, { recursive: true });
  const destino = path.join(dir, `${etiqueta}_${sello()}.db`);
  db.copiarA(destino);
  return destino;
}

function respaldadoHoy(db) {
  const t = Number(db.ajuste('ultimoRespaldo', 0));
  return t > 0 && hoy(new Date(t)) === hoy();
}

module.exports = { respaldoDelDia, snapshotLocal, snapshotForzado, respaldadoHoy, titulos, hoy, sello };
