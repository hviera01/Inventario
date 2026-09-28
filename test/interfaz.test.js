const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { Inventario } = require('../lib/db');
const { crearServidor } = require('../lib/servidor');
const { generarExcel } = require('../lib/excel');
const { CLAVES } = require('../lib/campos');

const fila = (o) => ({ ...Object.fromEntries(CLAVES.map((c) => [c, ''])), ...o });
const FIXTURE = [
  fila({ descripcion: 'Desktop', nombre: 'PC-VENTAS09', marca: 'DELL', modelo: 'OPTIPLEX 3080', mac: 'AA:00:11:22:33:01', ip: '10.10.1.47', ubicacion: 'Oficina Principal', departamento: 'Creditos', responsable: 'Carlos Mendez', categoria: 'Hardware - Equipamiento informático', nomenclatura: 'HW', tipo: 'Fisico', cantidad: '1' }),
  fila({ descripcion: 'Telefono IP', nombre: 'CMENDEZ', marca: 'GRANDSTREAM', mac: 'AA:00:11:22:33:02', ip: '10.10.1.101', ubicacion: 'Oficina Principal', departamento: 'Creditos', responsable: 'Carlos Mendez', tipo: 'Fisico', cantidad: '1' }),
  fila({ descripcion: 'Desktop', nombre: 'CAJA01', marca: 'DELL', modelo: 'OPTIPLEX 3080', mac: 'AA:00:11:22:33:03', ip: '10.10.2.20', ubicacion: 'Ventanilla Norte', departamento: 'Caja/Laura Rivas', tipo: 'Fisico', cantidad: '1' }),
  fila({ descripcion: 'Printer', nombre: 'IMP1', marca: 'EPSON', modelo: 'L3250', serie: 'SN0000000001', ubicacion: 'Filial Sur', tipo: 'Fisico', cantidad: '1' }),
  fila({ descripcion: 'Camara IP', marca: 'HIKVISION', mac: 'AA:00:11:22:33:04', ip: '10.10.3.210', ubicacion: 'Filial Este', tipo: 'Fisico', cantidad: '1' }),
  fila({ descripcion: 'Camara IP', marca: 'HIKVISION', mac: 'AA:00:11:22:33:04', ip: '10.10.3.211', ubicacion: 'Filial Este', tipo: 'Fisico', cantidad: '1' }),
];

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
async function esperar(fn, ms = 4000, msg = 'condición') {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    try { const v = fn(); if (v) return v; } catch (_) { await dormir(0); }
    await dormir(25);
  }
  throw new Error('Tiempo agotado esperando: ' + msg);
}

async function preparar() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inv-ui-'));
  const db = new Inventario(path.join(dir, 'inventario.db'));
  const srv = crearServidor({ db, dirDatos: dir, dirPublico: path.join(__dirname, '..', 'public'), puerto: 47960 });
  const puerto = await srv.escuchar();
  const base = `http://127.0.0.1:${puerto}`;
  const xlsx = await generarExcel(FIXTURE);
  const r = await fetch(`${base}/api/importar?reemplazar=0&prueba=1`, { method: 'POST', headers: { Connection: 'close', 'X-Usuario': 'Setup' }, body: xlsx });
  assert.equal(r.status, 200);
  const errores = [];
  const dom = await JSDOM.fromURL(base + '/', {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.localStorage.setItem('inv.nombre', 'Prueba');
      window.fetch = (u, o) => fetch(new URL(u, base), { ...o, headers: { Connection: 'close', ...((o && o.headers) || {}) } });
      window.EventSource = class { addEventListener() {} close() {} };
      window.matchMedia = (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      window.Element.prototype.scrollIntoView = function () {};
      window.addEventListener('error', (e) => errores.push(e.message));
      window.console.error = (...a) => errores.push(a.join(' '));
    },
  });
  const w = dom.window;
  await esperar(() => w.document.documentElement.dataset.listo === '1', 8000, 'arranque de la app');
  const cerrar = async () => { w.close(); await srv.cerrar(); db.cerrar(); fs.rmSync(dir, { recursive: true, force: true }); };
  return { w, d: w.document, db, srv, base, errores, cerrar };
}

const filas = (d) => [...d.querySelectorAll('#libro tbody tr[data-id]')];
function escribir(w, el, valor) { el.value = valor; el.dispatchEvent(new w.Event('input', { bubbles: true })); el.dispatchEvent(new w.Event('change', { bubbles: true })); }
const tecla = (w, destino, key, extra = {}) => destino.dispatchEvent(new w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra }));
const celdaDe = (d, nombre, campo) => filas(d).find((r) => r.textContent.includes(nombre)).querySelector(`td.k-${campo}`);
const clicDerecho = (w, el) => el.dispatchEvent(new w.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 200 }));
const itemMenu = (d, texto) => [...d.querySelectorAll('.menu button')].find((b) => b.textContent.includes(texto));
const panel = (d) => d.getElementById('panel-filtros');
const abrirPanel = async (d) => { if (panel(d).classList.contains('oculto')) d.getElementById('btn-filtros').click(); await esperar(() => !panel(d).classList.contains('oculto'), 3000, 'panel de filtros abierto'); };
const filtro = (d, campo) => d.querySelector(`#panel-filtros .pf-campo[data-k="${campo}"] .f-in`);
const abrirLista = (d, campo) => d.querySelector(`#panel-filtros .pf-campo[data-k="${campo}"] .f-btn`).click();
const buscarFiltros = (d) => d.getElementById('btn-buscar-filtros').click();
const quitarFiltros = async (d) => { await abrirPanel(d); d.getElementById('btn-eliminar-filtros').click(); };
const opcion = (d, valor) => [...d.querySelectorAll('.pop .pop-item')].find((b) => b.dataset.v === valor);

test('interfaz: arranque, tabla completa, panel de filtros desplegable y búsqueda', async () => {
  const t = await preparar();
  try {
    const { w, d } = t;
    assert.equal(filas(d).length, 6);
    assert.equal(d.querySelectorAll('#libro thead tr.cab th[data-k]').length, 17, 'las 17 columnas separadas');
    assert.equal(d.querySelector('#libro thead tr.filtros'), null, 'sin fila de filtros en la tabla');
    assert.ok(panel(d).classList.contains('oculto'), 'el panel de filtros está oculto al inicio');
    assert.ok(!d.querySelector('.pastilla-prueba').classList.contains('oculto'), 'pastilla de prueba visible');
    assert.equal(d.getElementById('ins-dup').textContent, '1');
    assert.match(d.getElementById('estado').textContent, /6\s*de\s*6\s*filas/);
    assert.equal(d.querySelector('#riel'), null, 'sin columna lateral de filtros');

    const q = d.getElementById('q');
    escribir(w, q, 'mendez');
    await esperar(() => filas(d).length === 2, 3000, 'búsqueda mendez');
    escribir(w, q, 'mendes');
    await esperar(() => filas(d).length === 2 && d.querySelector('.buscador').classList.contains('aprox'), 3000, 'búsqueda aproximada');
    escribir(w, q, 'aa0011223302');
    await esperar(() => filas(d).length === 1, 3000, 'MAC sin separadores');
    escribir(w, q, 'zzzzqqq');
    await esperar(() => d.querySelector('.fila-mensaje'), 3000, 'sin resultados');
    d.querySelector('.fila-mensaje [data-quitar-filtros]').click();
    await esperar(() => filas(d).length === 6 && q.value === '', 3000, 'quitar búsqueda desde el mensaje');

    await abrirPanel(d);
    assert.equal(panel(d).querySelectorAll('.pf-campo').length, 17, 'un filtro por cada columna');
    escribir(w, filtro(d, 'ubicacion'), 'sur');
    await dormir(250);
    assert.equal(filas(d).length, 6, 'no filtra hasta pulsar Buscar');
    buscarFiltros(d);
    await esperar(() => filas(d).length === 1, 3000, 'filtro aplicado con Buscar');
    await esperar(() => panel(d).classList.contains('oculto'), 3000, 'el panel se cierra al buscar');
    assert.equal(d.getElementById('ins-filtros').textContent, '1');
    await abrirPanel(d);
    assert.equal(filtro(d, 'ubicacion').value, 'sur', 'el panel conserva el filtro aplicado');
    d.getElementById('btn-eliminar-filtros').click();
    await esperar(() => filas(d).length === 6, 3000, 'eliminar filtros');
    assert.equal(filtro(d, 'ubicacion').value, '');

    abrirLista(d, 'marca');
    await esperar(() => opcion(d, 'DELL'), 3000, 'lista de marcas');
    opcion(d, 'DELL').click();
    opcion(d, 'GRANDSTREAM').click();
    escribir(w, filtro(d, 'ubicacion'), 'oficina');
    await dormir(200);
    assert.equal(filas(d).length, 6, 'sin aplicar todavía');
    buscarFiltros(d);
    await esperar(() => filas(d).length === 2, 3000, 'combinación entre columnas');
    await quitarFiltros(d);
    await esperar(() => filas(d).length === 6, 3000, 'todo limpio');
    assert.deepEqual(t.errores, []);
  } finally { await t.cerrar(); }
});

test('interfaz: selección de fila por su número, ficha, separar y duplicados en vivo', async () => {
  const t = await preparar();
  try {
    const { w, d, db } = t;
    assert.equal(d.querySelectorAll('.caja-sel').length, 0, 'sin cuadros de selección');
    const abrirFila = async (nombre) => {
      filas(d).find((r) => r.textContent.includes(nombre)).dispatchEvent(new w.MouseEvent('dblclick', { bubbles: true }));
      await esperar(() => d.querySelector('.hoja.completa'), 3000, 'ficha abierta');
    };
    await abrirFila('PC-VENTAS09');
    assert.equal(d.getElementById('f-nombre').value, 'PC-VENTAS09');
    assert.equal(d.querySelector('.etiqueta-prev'), null, 'sin vista de etiqueta');
    escribir(w, d.getElementById('f-nombre'), 'PC-VENTAS10');
    assert.ok(d.getElementById('f-nombre').closest('.campo').classList.contains('cambiado'));
    d.querySelector('.hoja-pie .btn.senal').click();
    await esperar(() => !d.querySelector('.hoja'), 3000, 'ficha cerrada');
    await esperar(() => db.listar().some((f) => f.nombre === 'PC-VENTAS10'), 3000, 'guardado en la base');

    await abrirFila('CAJA01');
    const sep = d.querySelector('.separar');
    assert.ok(!sep.classList.contains('oculto'), 'ayuda para separar visible');
    sep.querySelector('button').click();
    assert.equal(d.getElementById('f-departamento').value, 'Caja');
    assert.equal(d.getElementById('f-responsable').value, 'Laura Rivas');
    d.querySelector('.hoja-pie .btn.senal').click();
    await esperar(() => db.listar().some((f) => f.nombre === 'CAJA01' && f.departamento === 'Caja' && f.responsable === 'Laura Rivas'), 3000, 'separación guardada');
    await esperar(() => !d.querySelector('.hoja'), 3000, 'ficha anterior cerrada');

    await abrirFila('IMP1');
    escribir(w, d.getElementById('f-mac'), 'aa-00-11-22-33-04');
    await esperar(() => d.querySelector('.aviso-campo.rojo:not(.oculto)'), 3000, 'aviso de duplicado');
    assert.match(d.querySelector('.aviso-campo.rojo').textContent, /MAC duplicada/);
    d.querySelector('.hoja-cab .cerrar').click();
    await esperar(() => d.querySelector('.hoja.chica'), 3000, 'confirmar descarte');
    d.querySelector('.hoja.chica .hoja-pie .btn:last-child').click();
    await esperar(() => !d.querySelector('.hoja'), 3000, 'todo cerrado');

    const primera = filas(d)[0];
    primera.querySelector('td.n').click();
    await esperar(() => !d.getElementById('barra-sel').classList.contains('oculto'), 3000, 'barra de selección');
    assert.ok(primera.classList.contains('sel'));
    filas(d)[2].querySelector('td.n').dispatchEvent(new w.MouseEvent('click', { bubbles: true, ctrlKey: true }));
    await esperar(() => /2 filas seleccionadas/.test(d.getElementById('barra-sel').textContent), 3000, 'dos filas');
    [...d.querySelectorAll('#barra-sel .btn')].find((b) => b.textContent.includes('Deseleccionar')).click();
    await esperar(() => d.getElementById('barra-sel').classList.contains('oculto'), 3000, 'sin selección');
    assert.deepEqual(t.errores, []);
  } finally { await t.cerrar(); }
});

test('interfaz: agregar con autocompletado, guardar y agregar otro, eliminar con deshacer', async () => {
  const t = await preparar();
  try {
    const { w, d, db } = t;
    d.querySelector('#barra .btn.senal').click();
    await esperar(() => d.querySelector('.hoja.completa'), 3000, 'ficha nueva');
    assert.equal(d.getElementById('f-cantidad').value, '1');
    escribir(w, d.getElementById('f-descripcion'), 'Desktop');
    await esperar(() => d.querySelector('.aviso-campo:not(.oculto) .btn'), 3000, 'plantillas de autocompletado');
    d.querySelector('.aviso-campo:not(.oculto) .btn').click();
    assert.equal(d.getElementById('f-marca').value, 'DELL');
    assert.equal(d.getElementById('f-modelo').value, 'OPTIPLEX 3080');
    escribir(w, d.getElementById('f-nombre'), 'NUEVA-PC');
    escribir(w, d.getElementById('f-ubicacion'), 'filial sur');
    d.getElementById('f-ubicacion').dispatchEvent(new w.Event('blur'));
    assert.equal(d.getElementById('f-ubicacion').value, 'Filial Sur');
    escribir(w, d.getElementById('f-responsable'), 'Persona Nueva');
    [...d.querySelectorAll('.hoja-pie .btn')].find((b) => b.textContent.includes('agregar otro')).click();
    await esperar(() => db.listar().some((f) => f.nombre === 'NUEVA-PC' && f.responsable === 'Persona Nueva'), 3000, 'guardado con valor nuevo sin preguntar');
    await esperar(() => d.querySelector('.hoja.completa') && d.getElementById('f-nombre').value === '', 3000, 'segunda ficha');
    assert.equal(d.getElementById('f-ubicacion').value, 'Filial Sur');
    assert.equal(d.getElementById('f-marca').value, '');
    d.querySelector('.hoja-cab .cerrar').click();
    await esperar(() => !d.querySelector('.hoja'), 3000, 'cierre sin cambios reales');
    assert.equal(db.total(), 7);

    filas(d)[0].querySelector('td.n').click();
    await esperar(() => !d.getElementById('barra-sel').classList.contains('oculto'), 3000, 'barra de selección');
    [...d.querySelectorAll('#barra-sel .btn')].find((b) => b.textContent.includes('Eliminar')).click();
    await esperar(() => d.querySelector('.hoja.chica'), 3000, 'confirmación');
    d.querySelector('.hoja.chica .hoja-pie .btn:last-child').click();
    await esperar(() => db.total() === 6, 3000, 'eliminado');
    const deshacer = await esperar(() => [...d.querySelectorAll('.sello button')].find((b) => b.textContent === 'Deshacer'), 3000, 'sello con deshacer');
    deshacer.click();
    await esperar(() => db.total() === 7, 3000, 'recuperado');
    assert.deepEqual(t.errores, []);
  } finally { await t.cerrar(); }
});

test('interfaz: edición directa en celdas, valores nuevos sin preguntar, deshacer y duplicados', async () => {
  const t = await preparar();
  try {
    const { w, d, db } = t;
    const cuerpo = d.body;
    const porNombre = (n) => db.listar().find((f) => f.nombre === n);

    celdaDe(d, 'CAJA01', 'marca').click();
    await esperar(() => celdaDe(d, 'CAJA01', 'marca').classList.contains('celda-sel'), 3000, 'celda seleccionada');
    assert.match(d.getElementById('estado').textContent, /CAJA01/);
    assert.match(d.getElementById('estado').textContent, /Marca/);

    tecla(w, cuerpo, 'l');
    await dormir(200);
    assert.equal(d.querySelector('td.editando'), null, 'escribir una letra no edita la celda');
    tecla(w, cuerpo, 'F2');
    const editor = await esperar(() => d.querySelector('td.editando input'), 3000, 'editor por F2');
    assert.equal(editor.value, 'DELL');
    assert.equal(d.querySelector('.sug.nuevo'), null, 'no hay opción de valor nuevo');
    escribir(w, editor, 'lenovo');
    tecla(w, editor, 'Enter');
    await esperar(() => porNombre('CAJA01').marca === 'LENOVO', 4000, 'valor nuevo guardado en mayúsculas');
    await esperar(() => !d.querySelector('td.editando'), 3000, 'editor cerrado');
    assert.match(d.getElementById('estado').textContent, /guardado/);

    celdaDe(d, 'IMP1', 'modelo').click();
    tecla(w, cuerpo, 'F2');
    const ed2 = await esperar(() => d.querySelector('td.editando input'), 3000, 'editor por F2');
    assert.equal(ed2.value, 'L3250');
    escribir(w, ed2, 'l3250x');
    tecla(w, ed2, 'Tab');
    await esperar(() => porNombre('IMP1').modelo === 'L3250X', 4000, 'modelo guardado con Tab');
    await esperar(() => celdaDe(d, 'IMP1', 'serie').classList.contains('celda-sel'), 3000, 'pasó a la celda siguiente');

    tecla(w, cuerpo, 'z', { ctrlKey: true });
    await esperar(() => porNombre('IMP1').modelo === 'L3250', 4000, 'cambio deshecho');
    tecla(w, cuerpo, 'Delete');
    await dormir(200);
    assert.equal(porNombre('IMP1').modelo, 'L3250', 'Supr no vacía la celda');

    celdaDe(d, 'IMP1', 'mac').click();
    tecla(w, cuerpo, 'F2');
    const ed3 = await esperar(() => d.querySelector('td.editando input'), 3000, 'editor MAC');
    escribir(w, ed3, 'aa-00-11-22-33-04');
    tecla(w, ed3, 'Enter');
    await esperar(() => porNombre('IMP1').mac === 'AA:00:11:22:33:04', 4000, 'MAC normalizada');
    await esperar(() => [...d.querySelectorAll('.sello')].some((s) => s.textContent.includes('MAC ya registrada')), 3000, 'aviso de MAC duplicada');

    celdaDe(d, 'IMP1', 'nombre').click();
    tecla(w, cuerpo, 'n');
    await esperar(() => d.querySelector('.hoja.completa'), 3000, 'n abre registro nuevo aunque haya una celda seleccionada');
    d.querySelector('.hoja-cab .cerrar').click();
    await esperar(() => !d.querySelector('.hoja'), 3000, 'ficha cerrada');
    tecla(w, cuerpo, 'F2');
    await esperar(() => d.querySelector('td.editando input'), 3000, 'editor');
    tecla(w, d.querySelector('td.editando input'), 'Escape');
    await esperar(() => !d.querySelector('td.editando'), 3000, 'edición cancelada');
    assert.equal(porNombre('IMP1').nombre, 'IMP1');
    assert.deepEqual(t.errores, []);
  } finally { await t.cerrar(); }
});

test('interfaz: modo duplicados dentro de la tabla, corrección en la celda y descartar', async () => {
  const t = await preparar();
  try {
    const { w, d, db } = t;
    d.getElementById('btn-dup').click();
    await esperar(() => !d.getElementById('franja-dup').classList.contains('oculto'), 3000, 'banner de duplicados');
    await esperar(() => filas(d).length === 2, 3000, 'solo las filas duplicadas');
    assert.equal(d.querySelectorAll('td.dup').length, 2, 'celdas duplicadas resaltadas');
    assert.ok(filas(d)[0].classList.contains('grupo-ini'));
    assert.match(d.getElementById('franja-dup').textContent, /1 grupo/);

    const td = filas(d)[0].querySelector('td.k-mac');
    td.click();
    tecla(w, d.body, 'F2');
    const ed = await esperar(() => d.querySelector('td.editando input'), 3000, 'editor');
    escribir(w, ed, 'aa-bb-cc-dd-ee-01');
    tecla(w, ed, 'Enter');
    await esperar(() => db.listar().some((f) => f.mac === 'AA:BB:CC:DD:EE:01'), 4000, 'MAC corregida');
    await esperar(() => filas(d).length === 0 && /No hay duplicados/.test(d.getElementById('franja-dup').textContent), 3000, 'sin duplicados pendientes');
    assert.equal(d.getElementById('ins-dup').classList.contains('oculto'), true);
    d.querySelector('#franja-dup .btn').click();
    await esperar(() => d.getElementById('franja-dup').classList.contains('oculto') && filas(d).length === 6, 3000, 'salir del modo');
    assert.deepEqual(t.errores, []);
  } finally { await t.cerrar(); }
});

test('interfaz: botón para separar departamentos con responsable unido', async () => {
  const t = await preparar();
  try {
    const { d, db } = t;
    const btn = d.getElementById('btn-separar');
    assert.ok(!btn.classList.contains('oculto'));
    assert.equal(d.getElementById('ins-separar').textContent, '1');
    btn.click();
    await esperar(() => d.querySelector('.hoja.ancha .vista-previa'), 3000, 'vista previa');
    assert.match(d.querySelector('.vista-previa').textContent, /Caja\/Laura Rivas/);
    assert.equal(d.querySelectorAll('.vista-previa input[type=checkbox]:checked').length, 1);
    d.querySelector('.hoja-pie .btn.senal').click();
    await esperar(() => db.listar().some((f) => f.nombre === 'CAJA01' && f.departamento === 'Caja' && f.responsable === 'Laura Rivas'), 4000, 'separado en la base');
    await esperar(() => !d.querySelector('.hoja') && d.getElementById('btn-separar').classList.contains('oculto'), 4000, 'botón oculto al terminar');
    assert.deepEqual(t.errores, []);
  } finally { await t.cerrar(); }
});

test('interfaz: clic derecho en filas y columnas, anclar fila y columna, filtrar por valor', async () => {
  const t = await preparar();
  try {
    const { w, d } = t;
    clicDerecho(w, celdaDe(d, 'CAJA01', 'marca'));
    await esperar(() => itemMenu(d, 'Anclar fila arriba'), 3000, 'menú de fila');
    assert.ok(itemMenu(d, 'Abrir ficha') && itemMenu(d, 'Duplicar fila') && itemMenu(d, 'Insertar fila debajo') && itemMenu(d, 'Eliminar fila') && itemMenu(d, 'Separar departamento'));
    itemMenu(d, 'Anclar fila arriba').click();
    await esperar(() => filas(d)[0].classList.contains('fija') && filas(d)[0].textContent.includes('CAJA01'), 3000, 'fila anclada arriba');

    clicDerecho(w, celdaDe(d, 'IMP1', 'marca'));
    await esperar(() => itemMenu(d, 'Filtrar por este valor'), 3000, 'menú de celda');
    itemMenu(d, 'Filtrar por este valor').click();
    await esperar(() => filas(d).length === 1 && filas(d)[0].textContent.includes('IMP1'), 3000, 'filtrado por el valor de la celda');
    await quitarFiltros(d);
    await esperar(() => filas(d).length === 6, 3000, 'filtros quitados');

    clicDerecho(w, d.querySelector('tr.cab th[data-k="modelo"] .th-in'));
    await esperar(() => itemMenu(d, 'Anclar columna'), 3000, 'menú de columna');
    itemMenu(d, 'Anclar columna').click();
    await esperar(() => d.querySelector('tr.cab th[data-k="modelo"]').classList.contains('anclada'), 3000, 'columna anclada');
    assert.ok(d.querySelector('tr.cab th[data-k="nombre"]').classList.contains('anclada'), 'nombre anclada por defecto');
    clicDerecho(w, d.querySelector('tr.cab th[data-k="modelo"] .th-in'));
    await esperar(() => itemMenu(d, 'Ocultar columna'), 3000, 'menú de columna otra vez');
    itemMenu(d, 'Ocultar columna').click();
    await esperar(() => !d.querySelector('tr.cab th[data-k="modelo"]'), 3000, 'columna oculta');
    assert.deepEqual(t.errores, []);
  } finally { await t.cerrar(); }
});

test('interfaz: marcar y quitar pendiente, con vista de pendientes en la barra', async () => {
  const t = await preparar();
  try {
    const { w, d, db } = t;
    clicDerecho(w, celdaDe(d, 'PC-VENTAS09', 'nombre'));
    const marcar = await esperar(() => itemMenu(d, 'Marcar como pendiente'), 3000, 'menú con marcar pendiente');
    marcar.click();
    await esperar(() => d.querySelector('.hoja.chica textarea'), 3000, 'diálogo de motivo');
    escribir(w, d.querySelector('.hoja.chica textarea'), 'Falta confirmar MAC con el proveedor');
    d.querySelector('.hoja.chica .hoja-pie .btn:last-child').click();
    await esperar(() => db.listar().find((f) => f.nombre === 'PC-VENTAS09').pendiente === 1, 3000, 'marcado pendiente en la base');
    await esperar(() => filas(d).find((r) => r.textContent.includes('PC-VENTAS09')).classList.contains('pendiente'), 3000, 'fila resaltada');
    await esperar(() => !d.getElementById('ins-pend').classList.contains('oculto') && d.getElementById('ins-pend').textContent === '1', 3000, 'insignia de pendientes');

    d.getElementById('btn-pend').click();
    await esperar(() => filas(d).length === 1 && filas(d)[0].textContent.includes('PC-VENTAS09'), 3000, 'modo pendientes filtra la tabla');
    d.getElementById('btn-pend').click();
    await esperar(() => filas(d).length === 6, 3000, 'vuelve a la vista completa');

    clicDerecho(w, celdaDe(d, 'PC-VENTAS09', 'nombre'));
    const quitar = await esperar(() => itemMenu(d, 'quitar pendiente'), 3000, 'menú con quitar pendiente');
    quitar.click();
    await esperar(() => d.querySelector('.hoja.chica'), 3000, 'diálogo con el motivo');
    assert.match(d.querySelector('.hoja.chica').textContent, /Falta confirmar MAC con el proveedor/);
    d.querySelector('.hoja.chica .hoja-pie .btn:last-child').click();
    await esperar(() => db.listar().find((f) => f.nombre === 'PC-VENTAS09').pendiente === 0, 3000, 'pendiente quitado');
    await esperar(() => d.getElementById('ins-pend').classList.contains('oculto'), 3000, 'insignia oculta de nuevo');
    assert.deepEqual(t.errores, []);
  } finally { await t.cerrar(); }
});

test('interfaz: minimizar la ficha muestra la tabla sin perder los datos del formulario', async () => {
  const t = await preparar();
  try {
    const { w, d } = t;
    d.querySelector('#barra .btn.senal').click();
    await esperar(() => d.querySelector('.hoja.completa'), 3000, 'ficha nueva');
    assert.equal(d.getElementById('f-ubicacion').value, 'Oficina Principal', 'ubicación por defecto');
    escribir(w, d.getElementById('f-nombre'), 'SIN-GUARDAR-AUN');
    d.querySelector('.hoja-cab .minimizar').click();
    await esperar(() => d.querySelector('.velo.completa').classList.contains('minimizada'), 3000, 'ficha minimizada');
    await esperar(() => d.querySelector('.chip-min'), 3000, 'chip flotante para volver');
    assert.ok(filas(d).length > 0, 'la tabla queda visible y usable');
    d.querySelector('.chip-min').click();
    await esperar(() => !d.querySelector('.velo.completa').classList.contains('minimizada') && !d.querySelector('.chip-min'), 3000, 'ficha restaurada');
    assert.equal(d.getElementById('f-nombre').value, 'SIN-GUARDAR-AUN', 'los datos del formulario se conservaron');
    d.querySelector('.hoja-cab .cerrar').click();
    await esperar(() => d.querySelector('.hoja.chica'), 3000, 'confirmar descarte al cerrar de verdad');
    d.querySelector('.hoja.chica .hoja-pie .btn:last-child').click();
    await esperar(() => !d.querySelector('.hoja'), 3000, 'todo cerrado');
    assert.deepEqual(t.errores, []);
  } finally { await t.cerrar(); }
});

test('interfaz: atajos, autocompletado por equipo único y Ctrl+Enter en la ficha', async () => {
  const t = await preparar();
  try {
    const { w, d, db } = t;
    tecla(w, d.body, 'F1');
    await esperar(() => d.querySelector('.hoja.media'), 3000, 'panel de atajos');
    assert.match(d.querySelector('.hoja.media').textContent, /Ctrl\+Z/);
    d.querySelector('.hoja-cab .cerrar').click();
    await esperar(() => !d.querySelector('.hoja'), 3000, 'atajos cerrado');

    tecla(w, d.body, 'n', { altKey: true });
    await esperar(() => d.querySelector('.hoja.completa'), 3000, 'ficha nueva por Alt+N');
    escribir(w, d.getElementById('f-descripcion'), 'Printer');
    d.getElementById('f-descripcion').dispatchEvent(new w.Event('blur'));
    await esperar(() => d.getElementById('f-marca').value === 'EPSON', 3000, 'autocompletado por equipo único');
    assert.equal(d.getElementById('f-modelo').value, 'L3250');
    assert.match(d.querySelector('.aviso-campo:not(.oculto)').textContent, /Datos completados/);
    escribir(w, d.getElementById('f-nombre'), 'IMP-NUEVA');
    tecla(w, d.getElementById('f-nombre'), 'Enter', { ctrlKey: true });
    await esperar(() => db.listar().some((f) => f.nombre === 'IMP-NUEVA' && f.marca === 'EPSON'), 4000, 'guardado con Ctrl+Enter');
    await esperar(() => d.querySelector('.hoja.completa') && d.getElementById('f-nombre').value === '', 3000, 'ficha siguiente lista');
    d.querySelector('.hoja-cab .cerrar').click();
    await esperar(() => !d.querySelector('.hoja'), 3000, 'cierre');
    assert.deepEqual(t.errores, []);
  } finally { await t.cerrar(); }
});

test('interfaz: restablecer a datos reales quita la pastilla y deja la base vacía', async () => {
  const t = await preparar();
  try {
    const { d, db } = t;
    d.querySelector('#barra button[aria-label="Más opciones"]').click();
    await esperar(() => itemMenu(d, 'Restablecer base de datos'), 3000, 'menú principal');
    itemMenu(d, 'Restablecer base de datos').click();
    await esperar(() => d.querySelector('.hoja.media'), 3000, 'diálogo de reinicio');
    assert.ok([...d.querySelectorAll('.hoja.media input[type=radio]')].find((r) => r.value === 'real').checked);
    [...d.querySelectorAll('.hoja-pie .btn')].find((b) => b.textContent.includes('Restablecer')).click();
    await esperar(() => db.total() === 0, 4000, 'base vacía');
    await esperar(() => d.querySelector('.pastilla-prueba').classList.contains('oculto'), 3000, 'pastilla oculta');
    await esperar(() => d.querySelector('.vacio-libro h2') && d.querySelector('.vacio-libro h2').textContent === 'Sin registros', 3000, 'estado vacío');
    assert.equal(db.ajuste('modoPrueba'), '0');
    assert.ok(fs.readdirSync(path.join(path.dirname(db.archivo), 'respaldos-automaticos')).some((f) => f.startsWith('antes-de-reiniciar')));
    assert.deepEqual(t.errores, []);
  } finally { await t.cerrar(); }
});

test('interfaz: deshacer y rehacer general con botones y atajos', async () => {
  const t = await preparar();
  try {
    const { w, d, db } = t;
    const btnU = d.getElementById('btn-deshacer');
    const btnR = d.getElementById('btn-rehacer');
    assert.equal(btnU.disabled, true);
    assert.equal(btnR.disabled, true);
    const porNombre = (n) => db.listar().find((f) => f.nombre === n);

    celdaDe(d, 'CAJA01', 'marca').click();
    tecla(w, d.body, 'F2');
    const ed = await esperar(() => d.querySelector('td.editando input'), 3000, 'editor');
    escribir(w, ed, 'lenovo');
    tecla(w, ed, 'Enter');
    await esperar(() => porNombre('CAJA01').marca === 'LENOVO', 4000, 'edición guardada');
    await esperar(() => !btnU.disabled, 3000, 'botón deshacer habilitado');
    assert.match(btnU.title, /edición de Marca/);
    btnU.click();
    await esperar(() => porNombre('CAJA01').marca === 'DELL', 4000, 'deshecho con el botón');
    await esperar(() => !btnR.disabled, 3000, 'botón rehacer habilitado');
    btnR.click();
    await esperar(() => porNombre('CAJA01').marca === 'LENOVO', 4000, 'rehecho con el botón');
    tecla(w, d.body, 'z', { ctrlKey: true });
    await esperar(() => porNombre('CAJA01').marca === 'DELL', 4000, 'Ctrl+Z');
    tecla(w, d.body, 'y', { ctrlKey: true });
    await esperar(() => porNombre('CAJA01').marca === 'LENOVO', 4000, 'Ctrl+Y');
    tecla(w, d.body, 'z', { ctrlKey: true, shiftKey: true });
    await dormir(200);
    tecla(w, d.body, 'z', { ctrlKey: true });
    await esperar(() => porNombre('CAJA01').marca === 'DELL', 4000, 'otra vez Ctrl+Z');

    d.querySelector('#barra .btn.senal').click();
    await esperar(() => d.querySelector('.hoja.completa'), 3000, 'ficha nueva');
    escribir(w, d.getElementById('f-descripcion'), 'Router');
    escribir(w, d.getElementById('f-nombre'), 'RT-DESHACER');
    tecla(w, d.getElementById('f-nombre'), 'Enter', { ctrlKey: true });
    await esperar(() => db.listar().some((f) => f.nombre === 'RT-DESHACER'), 4000, 'registro creado');
    await esperar(() => d.querySelector('.hoja.completa') && d.getElementById('f-nombre').value === '', 3000, 'ficha siguiente');
    d.querySelector('.hoja-cab .cerrar').click();
    await esperar(() => !d.querySelector('.hoja'), 3000, 'ficha cerrada');
    tecla(w, d.body, 'z', { ctrlKey: true });
    await esperar(() => !db.listar().some((f) => f.nombre === 'RT-DESHACER'), 4000, 'creación deshecha');
    tecla(w, d.body, 'y', { ctrlKey: true });
    await esperar(() => db.listar().some((f) => f.nombre === 'RT-DESHACER'), 4000, 'creación rehecha');

    filas(d)[0].querySelector('td.n').click();
    await esperar(() => !d.getElementById('barra-sel').classList.contains('oculto'), 3000, 'fila seleccionada');
    const total = db.total();
    [...d.querySelectorAll('#barra-sel .btn')].find((b) => b.textContent.includes('Eliminar')).click();
    await esperar(() => d.querySelector('.hoja.chica'), 3000, 'confirmación');
    d.querySelector('.hoja.chica .hoja-pie .btn:last-child').click();
    await esperar(() => db.total() === total - 1, 3000, 'eliminada');
    tecla(w, d.body, 'z', { ctrlKey: true });
    await esperar(() => db.total() === total, 4000, 'eliminación deshecha');
    assert.deepEqual(t.errores, []);
  } finally { await t.cerrar(); }
});

test('interfaz: zoom del texto con Ctrl+1, Ctrl+2, Ctrl+0, Ctrl+rueda y barra', async () => {
  const t = await preparar();
  try {
    const { w, d } = t;
    const z = () => parseFloat(d.documentElement.style.getPropertyValue('--z'));
    assert.equal(z(), 1);
    assert.equal(d.querySelector('.zoom-control .zoom-pct').textContent, '100%');
    tecla(w, d.body, '1', { ctrlKey: true });
    assert.ok(Math.abs(z() - 1.05) < 1e-9, 'Ctrl+1 agranda');
    tecla(w, d.body, '1', { ctrlKey: true });
    assert.ok(Math.abs(z() - 1.1) < 1e-9);
    assert.equal(d.querySelector('.zoom-control .zoom-pct').textContent, '110%');
    tecla(w, d.body, '2', { ctrlKey: true });
    tecla(w, d.body, '2', { ctrlKey: true });
    tecla(w, d.body, '2', { ctrlKey: true });
    assert.ok(Math.abs(z() - 0.95) < 1e-9, 'Ctrl+2 reduce');
    tecla(w, d.body, '0', { ctrlKey: true });
    assert.equal(z(), 1, 'Ctrl+0 restablece');

    const rueda = (dy, ctrl) => w.dispatchEvent(new w.WheelEvent('wheel', { deltaY: dy, ctrlKey: ctrl, cancelable: true, bubbles: true }));
    rueda(-100, true);
    assert.ok(Math.abs(z() - 1.05) < 1e-9, 'Ctrl+rueda arriba agranda');
    rueda(100, true);
    rueda(100, true);
    assert.ok(Math.abs(z() - 0.95) < 1e-9, 'Ctrl+rueda abajo reduce');
    rueda(100, false);
    assert.ok(Math.abs(z() - 0.95) < 1e-9, 'la rueda sola no cambia el zoom');

    escribir(w, d.getElementById('zoom-rango'), '150');
    assert.equal(z(), 1.5);
    assert.equal(d.querySelector('.zoom-control .zoom-pct').textContent, '150%');
    for (let i = 0; i < 30; i++) tecla(w, d.body, '1', { ctrlKey: true });
    assert.equal(z(), 1.8, 'límite máximo');
    for (let i = 0; i < 60; i++) tecla(w, d.body, '2', { ctrlKey: true });
    assert.equal(z(), 0.7, 'límite mínimo');
    d.querySelector('.zoom-control .zoom-pct').click();
    assert.equal(z(), 1, 'el porcentaje restablece');

    d.querySelector('#barra .btn.senal').click();
    await esperar(() => d.querySelector('.hoja.completa'), 3000, 'ficha abierta');
    tecla(w, d.body, '1', { ctrlKey: true });
    assert.ok(Math.abs(z() - 1.05) < 1e-9, 'el zoom funciona con el formulario abierto');
    assert.equal(w.localStorage.getItem('inv.z'), '1.05');
    assert.deepEqual(t.errores, []);
  } finally { await t.cerrar(); }
});

test('interfaz: mantener presionado (touch) abre el menú como el clic derecho; doble toque siempre abre la ficha', async () => {
  const t = await preparar();
  try {
    const { w, d } = t;
    const celda = celdaDe(d, 'CAJA01', 'marca');
    celda.dispatchEvent(new w.PointerEvent('pointerdown', { pointerType: 'touch', clientX: 50, clientY: 50, bubbles: true, cancelable: true }));
    await esperar(() => itemMenu(d, 'Anclar fila arriba'), 3000, 'menú por mantener presionado');
    celda.dispatchEvent(new w.PointerEvent('pointerup', { pointerType: 'touch', clientX: 50, clientY: 50, bubbles: true }));
    await esperar(() => { d.body.dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true })); return !d.querySelector('.menu'); }, 3000, 'menú cerrado');

    celdaDe(d, 'IMP1', 'marca').dispatchEvent(new w.PointerEvent('pointerdown', { pointerType: 'touch', clientX: 60, clientY: 60, bubbles: true }));
    celdaDe(d, 'IMP1', 'marca').dispatchEvent(new w.PointerEvent('pointerup', { pointerType: 'touch', clientX: 60, clientY: 60, bubbles: true }));
    filas(d).find((x) => x.textContent.includes('IMP1')).dispatchEvent(new w.MouseEvent('dblclick', { bubbles: true }));
    await esperar(() => d.querySelector('.hoja.completa'), 3000, 'doble toque abre la ficha');
    d.querySelector('.hoja-cab .cerrar').click();
    await esperar(() => !d.querySelector('.hoja'), 3000, 'ficha cerrada');
    assert.deepEqual(t.errores, []);
  } finally { await t.cerrar(); }
});
