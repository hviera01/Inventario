const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const B = require('../lib/busqueda');
const { importarExcel } = require('../lib/excel');
const { CLAVES } = require('../lib/campos');

const f = (o) => ({ ...Object.fromEntries(CLAVES.map((c) => [c, ''])), id: Math.random().toString(36).slice(2), ...o });

const muestra = [
  f({ nombre: 'PC-VENTAS09', descripcion: 'Desktop', marca: 'DELL', modelo: 'OPTIPLEX 3080', mac: 'AA:00:11:22:33:01', ip: '10.10.1.47', ubicacion: 'Oficina Principal', departamento: 'Creditos', responsable: 'Carlos Mendez' }),
  f({ nombre: 'CMENDEZ', descripcion: 'Telefono IP', marca: 'GRANDSTREAM', mac: 'AA0011223302', ip: '10.10.1.101', ubicacion: 'Oficina Principal', responsable: 'Carlos Mendez' }),
  f({ nombre: 'CAJA01', descripcion: 'Desktop', marca: 'DELL', modelo: 'OPTIPLEX 3080', mac: 'AA:00:11:22:33:03', ip: '10.10.2.20', ubicacion: 'Ventanilla Norte', responsable: 'Laura Rivas' }),
  f({ nombre: 'IMP1', descripcion: 'Printer', marca: 'EPSON', modelo: 'L3250', serie: 'SN0000000001', ubicacion: 'Filial Sur' }),
];
const ix = B.construirIndice(muestra);
const nombres = (r) => r.filas.map((x) => x.nombre);

test('busca sin importar mayúsculas ni acentos, en cualquier orden', () => {
  assert.deepEqual(nombres(B.buscar(ix, 'mendez carlos')), ['PC-VENTAS09', 'CMENDEZ']);
  assert.deepEqual(nombres(B.buscar(ix, 'OFICINA principal desktop')), ['PC-VENTAS09']);
  assert.deepEqual(nombres(B.buscar(ix, 'telefono ip')), ['CMENDEZ']);
});

test('MAC en cualquier formato', () => {
  assert.deepEqual(nombres(B.buscar(ix, 'aa0011223302')), ['CMENDEZ']);
  assert.deepEqual(nombres(B.buscar(ix, 'AA:00:11:22:33:02')), ['CMENDEZ']);
  assert.deepEqual(nombres(B.buscar(ix, 'aa-00-11-22-33-02')), ['CMENDEZ']);
  assert.deepEqual(nombres(B.buscar(ix, 'aa0011223301')), ['PC-VENTAS09']);
});

test('IP parcial y varios números', () => {
  assert.deepEqual(nombres(B.buscar(ix, '10.10.2')), ['CAJA01']);
  assert.deepEqual(nombres(B.buscar(ix, '1.47')), ['PC-VENTAS09']);
  assert.deepEqual(nombres(B.buscar(ix, '3080 optiplex')), ['PC-VENTAS09', 'CAJA01']);
});

test('aproximado: errores de tipeo y transposiciones', () => {
  const r = B.buscar(ix, 'mendes');
  assert.equal(r.aproximado, true);
  assert.deepEqual(nombres(r), ['PC-VENTAS09', 'CMENDEZ']);
  assert.deepEqual(nombres(B.buscar(ix, 'optiplxe')), ['PC-VENTAS09', 'CAJA01']);
  assert.deepEqual(nombres(B.buscar(ix, 'nort')), ['CAJA01']);
});

test('números no se comparan de forma aproximada', () => {
  assert.deepEqual(nombres(B.buscar(ix, '3090')), []);
});

test('campo:valor, exclusión y frases', () => {
  assert.deepEqual(nombres(B.buscar(ix, 'marca:dell')), ['PC-VENTAS09', 'CAJA01']);
  assert.deepEqual(nombres(B.buscar(ix, 'marca:dell -norte')), ['PC-VENTAS09']);
  assert.deepEqual(nombres(B.buscar(ix, '"oficina principal"')), ['PC-VENTAS09', 'CMENDEZ']);
  assert.deepEqual(nombres(B.buscar(ix, 'ip:10.10.1')), ['PC-VENTAS09', 'CMENDEZ']);
  assert.deepEqual(nombres(B.buscar(ix, 'ubi:sur')), ['IMP1']);
});

test('relajado: si nada coincide con todo, muestra lo que coincide con la mitad', () => {
  const r = B.buscar(ix, 'mendez printer');
  assert.equal(r.relajado, true);
  assert.ok(nombres(r).length >= 3);
});

test('filtros por columna y vacíos', () => {
  assert.equal(B.filtrar(muestra, { valores: { marca: ['DELL'] } }).length, 2);
  assert.equal(B.filtrar(muestra, { valores: { marca: ['DELL'], ubicacion: ['Oficina Principal'] } }).length, 1);
  assert.equal(B.filtrar(muestra, { vacios: ['mac'] }).length, 1);
  assert.equal(B.filtrar(muestra, { llenos: ['responsable'] }).length, 3);
  const c = B.conteos(muestra, 'marca');
  assert.deepEqual(c.valores[0], ['DELL', 2]);
});

test('duplicados: MAC en distinto formato, IP repetida, ignorados', () => {
  const filas = [
    f({ nombre: 'A', mac: 'AA:00:11:22:33:02', ip: '10.0.0.1' }),
    f({ nombre: 'B', mac: 'aa0011223302', ip: '10.0.0.2' }),
    f({ nombre: 'C', ip: '10.0.0.1', serie: 'N/A' }),
    f({ nombre: 'D', serie: 'N/A' }),
    f({ nombre: 'E', mac: 'AA:AA:AA:AA:AA:AA' }),
    f({ nombre: 'F', mac: 'AA:AA:AA:AA:AA:AA' }),
  ];
  const g = B.duplicados(filas, []);
  assert.deepEqual(g.map((x) => x.tipo).sort(), ['ip', 'mac']);
  const mac = g.find((x) => x.tipo === 'mac');
  assert.deepEqual(mac.filas.map((x) => x.nombre), ['A', 'B']);
  const ign = B.duplicados(filas, [mac.clave]);
  assert.equal(ign.find((x) => x.tipo === 'mac').ignorado, true);
});

test('conflictosDe avisa al escribir', () => {
  const filas = [f({ id: '1', nombre: 'A', mac: 'AA:00:11:22:33:02', ip: '10.0.0.1' })];
  const r = B.conflictosDe(filas, { mac: 'aa0011223302', ip: '10.0.0.9' }, 'otro');
  assert.equal(r.length, 1);
  assert.equal(r[0].campo, 'mac');
  assert.equal(B.conflictosDe(filas, { mac: 'aa0011223302' }, '1').length, 0);
});

const REAL = process.env.EXCEL_REAL || '';
test('datos reales: duplicados y búsquedas', { skip: !(REAL && fs.existsSync(REAL)) }, async () => {
  const { filas } = await importarExcel(fs.readFileSync(REAL));
  const reales = filas.map((x, i) => ({ ...x, id: String(i) }));
  const g = B.duplicados(reales, []);
  console.log(g.map((x) => `${x.etiqueta} ${x.valor} x${x.filas.length}`).join('\n'));
  const idx = B.construirIndice(reales);
  const t0 = Date.now();
  for (let i = 0; i < 50; i++) B.buscar(idx, 'camra ip');
  console.log('50 búsquedas aproximadas:', Date.now() - t0, 'ms');
  console.log('camra ip ->', B.buscar(idx, 'camra ip').filas.length, '| aa0011 ->', B.buscar(idx, 'aa0011').filas.length, '| optiplex 3080 ->', B.buscar(idx, 'optiplex 3080').filas.length);
  assert.ok(B.buscar(idx, 'camra ip').filas.length > 0);
});

test('filtro de texto por columna y valores vacíos', () => {
  const filas = [f({ nombre: 'A', marca: 'DELL', ubicacion: 'Oficina Principal' }), f({ nombre: 'B', marca: 'HP', ubicacion: 'Oficina Principal' }), f({ nombre: 'C', marca: '', ubicacion: 'Filial Sur' })];
  assert.equal(B.filtrar(filas, { texto: { ubicacion: 'oficina' } }).length, 2);
  assert.equal(B.filtrar(filas, { texto: { ubicacion: 'OFICINA', marca: 'de' } }).length, 1);
  assert.equal(B.filtrar(filas, { valores: { marca: [''] } }).length, 1);
  assert.equal(B.filtrar(filas, { valores: { marca: ['DELL', ''] } }).length, 2);
  assert.equal(B.filtrar(filas, { valores: { marca: ['DELL'] }, texto: { ubicacion: 'sur' } }).length, 0);
  assert.equal(B.filtrar(filas, { texto: { ubicacion: 'oficina' } }, 'ubicacion').length, 3);
});

test('separarDepartamento divide Departamento/Responsable', () => {
  assert.deepEqual(B.separarDepartamento('Caja/Marta Solis'), { depto: 'Caja', resp: 'Marta Solis' });
  assert.deepEqual(B.separarDepartamento(' Creditos / Norman  Caceres '), { depto: 'Creditos', resp: 'Norman Caceres' });
  assert.deepEqual(B.separarDepartamento('Responsable Filial/Eva Abrego'), { depto: 'Responsable Filial', resp: 'Eva Abrego' });
  assert.equal(B.separarDepartamento('Tecnologia'), null);
  assert.equal(B.separarDepartamento('Caja/'), null);
  assert.equal(B.separarDepartamento('/Ana'), null);
  assert.equal(B.separarDepartamento(''), null);
});
