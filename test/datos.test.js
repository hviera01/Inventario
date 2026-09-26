const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { Inventario, ConflictoVersion } = require('../lib/db');
const { importarExcel, generarExcel, leerExcel } = require('../lib/excel');
const { normalizarLote, canonizarEntrada } = require('../lib/normalizar');
const { CLAVES, CAMPOS } = require('../lib/campos');

const REAL = process.env.EXCEL_REAL || '';
const hayReal = REAL && fs.existsSync(REAL);

test('normalizar: mayúsculas en marca/modelo, espacios, alias y unificación', () => {
  const base = (o) => ({ ...Object.fromEntries(CLAVES.map((c) => [c, ''])), ...o });
  const { filas, cambios } = normalizarLote([
    base({ marca: 'Epson', modelo: 'Optiplex 3080', responsable: 'Ana Siera', proveedor: 'Leasing  - Red Tecnologica', descripcion: 'Desktop ', departamento: 'Caja/Ana  Perez', nombre: ' X  ' }),
    base({ marca: 'EPSON', modelo: 'OPTIPLEX 3080', responsable: 'Ana Sierra', proveedor: 'Leasing - Red Tecnologica', descripcion: 'Desktop' }),
    base({ modelo: 'KB216T1' }),
    base({ modelo: 'KB216T' }),
    base({ modelo: 'kb216t' }),
  ]);
  assert.equal(filas[0].marca, 'EPSON');
  assert.equal(filas[0].modelo, 'OPTIPLEX 3080');
  assert.equal(filas[0].responsable, 'Ana Sierra');
  assert.equal(filas[0].proveedor, 'Leasing - Red Tecnologica');
  assert.equal(filas[0].descripcion, 'Desktop');
  assert.equal(filas[0].departamento, 'Caja/Ana  Perez');
  assert.equal(filas[0].nombre, ' X  ');
  assert.equal(filas[2].modelo, 'KB216T1');
  assert.equal(filas[3].modelo, 'KB216T');
  assert.equal(filas[4].modelo, 'KB216T');
  assert.ok(cambios.length >= 6);
});

test('MAC: un solo formato AA:BB:CC:DD:EE:FF', () => {
  const { formatearMac } = require('../lib/campos');
  const casos = {
    'aa:00:11:22:33:02': 'AA:00:11:22:33:02',
    'AA0011223302': 'AA:00:11:22:33:02',
    'aa-00-11-22-33-02': 'AA:00:11:22:33:02',
    'aa00.1122.3302': 'AA:00:11:22:33:02',
    ' AA 00 11 22 33 02 ': 'AA:00:11:22:33:02',
    'S/A': 'S/A',
    '0002C7B568': '0002C7B568',
    '': '',
  };
  for (const [entrada, esperado] of Object.entries(casos)) assert.equal(formatearMac(entrada), esperado, entrada);
  assert.equal(canonizarEntrada({ mac: 'aa0011223302' }, {}).mac, 'AA:00:11:22:33:02');
  const base = Object.fromEntries(CLAVES.map((c) => [c, '']));
  const { filas, cambios } = normalizarLote([{ ...base, mac: 'aa-00-11-22-33-02' }, { ...base, mac: 'AA:BB:CC:DD:EE:FF' }]);
  assert.equal(filas[0].mac, 'AA:00:11:22:33:02');
  assert.equal(filas[1].mac, 'AA:BB:CC:DD:EE:FF');
  assert.equal(cambios.filter((c) => c.campo === 'mac').length, 1);
});

test('canonizarEntrada ajusta a lo ya existente', () => {
  const r = canonizarEntrada({ proveedor: 'propio ', ubicacion: 'oficina principal', marca: 'dell', nombre: ' PC1 ' }, { proveedor: ['Propio'], ubicacion: ['Oficina Principal'] });
  assert.equal(r.proveedor, 'Propio');
  assert.equal(r.ubicacion, 'Oficina Principal');
  assert.equal(r.marca, 'DELL');
  assert.equal(r.nombre, 'PC1');
});

test('db: crear, editar con control de versión, eliminar, restaurar, orden', () => {
  const db = new Inventario(':memory:');
  const eventos = [];
  db.on('cambio', (e) => eventos.push(e.tipo));
  const a = db.crear({ nombre: 'A', marca: 'dell' }, 'Henry');
  const b = db.crear({ nombre: 'B' }, 'Henry');
  const c = db.crear({ nombre: 'C' }, 'Henry', { despuesDe: a.id });
  assert.deepEqual(db.listar().map((f) => f.nombre), ['A', 'C', 'B']);
  assert.equal(a.marca, 'DELL');
  const a2 = db.actualizar(a.id, { nombre: 'A2' }, 'Otro', a.version);
  assert.equal(a2.version, a.version + 1);
  assert.throws(() => db.actualizar(a.id, { nombre: 'A3' }, 'Henry', a.version), ConflictoVersion);
  db.eliminar([b.id], 'Henry');
  assert.equal(db.total(), 2);
  db.restaurar([b.id], 'Henry');
  assert.equal(db.total(), 3);
  assert.ok(db.historial(a.id).length >= 2);
  assert.deepEqual(eventos.slice(0, 3), ['crear', 'crear', 'crear']);
  const t = db.actualizarLote([a.id, b.id, c.id], { ubicacion: 'Sur' }, 'Henry');
  assert.equal(t.length, 3);
  db.crear({}, 'Henry');
  db.cerrar();
});

test('excel real: importar + normalizar + guardar en db + exportar + releer', { skip: !hayReal }, async () => {
  const buf = fs.readFileSync(REAL);
  const imp = await importarExcel(buf);
  console.log('filas:', imp.filas.length, '| cambios de normalización:', imp.cambios.length);
  const resumen = {};
  imp.cambios.forEach((c) => { const k = `${c.campo}: "${c.antes}" -> "${c.despues}"`; resumen[k] = (resumen[k] || 0) + 1; });
  console.log(Object.entries(resumen).map(([k, n]) => `  ${n}x ${k}`).join('\n'));

  const db = new Inventario(':memory:');
  db.importar(imp.filas, 'Test');
  assert.equal(db.total(), imp.filas.length);

  const buf2 = await generarExcel(db.listar(), { titulo1: imp.titulo1, titulo2: imp.titulo2 });
  const otra = path.join(process.env.TEMP_OUT || __dirname, 'salida_test.xlsx');
  fs.writeFileSync(otra, buf2);
  const back = await leerExcel(buf2);
  assert.equal(back.filas.length, imp.filas.length);
  back.filas.forEach((f, i) => CLAVES.forEach((k) => assert.equal(f[k], imp.filas[i][k], `fila ${i + 1} ${k}`)));
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf2);
  const ws = wb.worksheets[0];
  assert.equal(ws.getRow(5).getCell(5).value, 'Nomenclatura Categoría de Activo');
  assert.deepEqual(CAMPOS.map((c, i) => ws.getRow(5).getCell(2 + i).value), CAMPOS.map((c) => c.l));
  assert.equal(ws.getRow(6).getCell(4).dataValidation.type, 'list');

  const ms = new Set(db.listar().map((f) => f.marca));
  assert.ok(!ms.has('Epson'));
  const mo = db.listar().map((f) => f.modelo);
  assert.ok(!mo.includes('Optiplex 3080') && !mo.includes('OptiPlex 3080'));
  assert.ok(mo.includes('KB216T1') && mo.includes('KB216T'));
  const resp = [...new Set(db.listar().map((f) => f.responsable).filter(Boolean))];
  const faltaLetra = (largo, corto) => largo.length === corto.length + 1 && [...largo].some((_, k) => (largo.slice(0, k) + largo.slice(k + 1)).toLowerCase() === corto.toLowerCase());
  const mismaPalabra = (a, b) => a.split(' ')[0].toLowerCase() === b.split(' ')[0].toLowerCase();
  assert.ok(!resp.some((a) => a.length >= 6 && resp.some((b) => faltaLetra(b, a) && mismaPalabra(a, b))), 'sin nombres a los que les falte una letra');
  const macs = db.listar().map((f) => f.mac).filter(Boolean);
  const invalidas = macs.filter((m) => !/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(m));
  assert.deepEqual(invalidas, ['S/A']);
  assert.ok(db.listar().some((f) => /\//.test(f.departamento)), 'los departamentos pegados no se tocan');
  assert.ok(db.listar().some((f) => /[|]/.test(f.departamento)), 'los errores de tipeo en departamento no se tocan');
  db.cerrar();
});

test('db: lo que crea cada usuario queda junto, en bloques, aunque agreguen al mismo tiempo', () => {
  const db = new Inventario(':memory:');
  const vacia = Object.fromEntries(CLAVES.map((c) => [c, '']));
  db.importar([{ ...vacia, nombre: 'BASE' }, { ...vacia, nombre: 'IMP1' }], 'Henry');
  const base = db.listar()[0];
  const nombres = () => db.listar().map((f) => f.nombre);
  db.crear({ nombre: 'H1' }, 'Henry');
  db.crear({ nombre: 'A1' }, 'Ana');
  db.crear({ nombre: 'H2' }, 'Henry');
  db.crear({ nombre: 'A2' }, 'Ana');
  db.crear({ nombre: 'H3' }, 'Henry');
  db.crear({ nombre: 'A3' }, 'Ana');
  const orden = nombres();
  assert.deepEqual(orden.slice(orden.indexOf('H1')), ['H1', 'H2', 'H3', 'A1', 'A2', 'A3']);
  assert.ok(orden.indexOf('BASE') < orden.indexOf('H1'));
  const dup = db.crear({ nombre: 'COPIA' }, 'Ana', { despuesDe: base.id });
  assert.equal(nombres()[nombres().indexOf('BASE') + 1], 'COPIA');
  assert.ok(dup.id);
  for (let i = 0; i < 70; i++) db.crear({ nombre: 'H-EXTRA' + i }, 'Henry');
  const final = nombres();
  const posH = final.filter((n) => n.startsWith('H')).map((n) => final.indexOf(n));
  assert.ok(Math.max(...posH) - Math.min(...posH) === posH.length - 1, 'el bloque de Henry sigue continuo tras muchas inserciones');
  const ordenes = db.listar().map((f) => f.orden);
  assert.equal(new Set(ordenes).size, ordenes.length, 'sin órdenes repetidos');
  db.cerrar();
});
