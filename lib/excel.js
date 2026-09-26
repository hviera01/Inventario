const ExcelJS = require('exceljs');
const { CAMPOS, CLAVES, CATEGORIAS, NOMENCLATURAS, TIPOS } = require('./campos');
const { normalizarLote } = require('./normalizar');

const HOJA = 'Inventario Activos de Apoyo';
const FILA_ENCABEZADO = 5;
const COL_INICIAL = 2;

function textoCelda(cell) {
  let v = cell.value;
  if (v && typeof v === 'object') {
    if (v.richText) v = v.richText.map((t) => t.text).join('');
    else if (v.result !== undefined) v = v.result;
    else if (v.text !== undefined) v = v.text;
    else if (v instanceof Date) v = v.toISOString();
    else v = '';
  }
  return v === null || v === undefined ? '' : String(v);
}

async function leerExcel(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.getWorksheet(HOJA) || wb.worksheets[0];
  if (!ws) throw new Error('El archivo no tiene hojas');
  const filas = [];
  for (let r = FILA_ENCABEZADO + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const f = {};
    let alguno = false;
    CLAVES.forEach((k, i) => {
      const v = textoCelda(row.getCell(COL_INICIAL + i));
      f[k] = v;
      if (v.trim() !== '') alguno = true;
    });
    if (alguno) filas.push(f);
  }
  if (!filas.length) throw new Error('No se encontraron filas de datos (se esperan desde la fila 6, columnas B a R)');
  const titulo1 = textoCelda(ws.getRow(1).getCell(1)).trim();
  const titulo2 = textoCelda(ws.getRow(2).getCell(1)).trim();
  return { filas, titulo1, titulo2 };
}

async function importarExcel(buffer) {
  const { filas, titulo1, titulo2 } = await leerExcel(buffer);
  const { filas: norm, cambios } = normalizarLote(filas);
  return { filas: norm, cambios, titulo1, titulo2 };
}

const AZUL = 'FF002060';
const VERDE = 'FF00B050';
const FUENTE = 'Times New Roman';

async function generarExcel(filas, { titulo1 = '', titulo2 = '' } = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Inventario';
  const ws = wb.addWorksheet(HOJA, {
    views: [{ state: 'frozen', xSplit: 0, ySplit: FILA_ENCABEZADO, topLeftCell: 'A6', showGridLines: false, zoomScale: 100 }],
  });
  ws.properties.defaultRowHeight = 15;

  ws.getColumn(1).width = 6.86;
  CAMPOS.forEach((c, i) => { ws.getColumn(COL_INICIAL + i).width = c.w; });

  ws.mergeCells('A1:O1');
  ws.mergeCells('A2:O2');
  ws.getCell('A1').value = titulo1 || null;
  ws.getCell('A1').font = { name: FUENTE, bold: true, size: 22, color: { argb: VERDE } };
  ws.getCell('A1').alignment = { horizontal: 'center' };
  ws.getRow(1).height = 27;
  ws.getCell('A2').value = titulo2 || null;
  ws.getCell('A2').font = { name: FUENTE, bold: true, size: 18, color: { argb: VERDE } };
  ws.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 20.25;
  ws.getRow(3).height = 11.25;
  ws.getRow(4).height = 13.5;

  const ixCantidad = CLAVES.indexOf('cantidad');
  const datos = filas.length
    ? filas.map((f) => CLAVES.map((k, i) => {
      const v = f[k] ?? '';
      if (i === ixCantidad && /^\d+$/.test(String(v).trim())) return Number(v);
      return v === '' ? null : v;
    }))
    : [CLAVES.map(() => null)];

  ws.addTable({
    name: 'Tabla2',
    displayName: 'Tabla2',
    ref: 'B' + FILA_ENCABEZADO,
    headerRow: true,
    totalsRow: false,
    style: { theme: 'TableStyleMedium15', showRowStripes: true, showFirstColumn: false, showLastColumn: false, showColumnStripes: false },
    columns: CAMPOS.map((c) => ({ name: c.l, filterButton: true })),
    rows: datos,
  });

  const blanco = { style: 'thin', color: { argb: 'FFFFFFFF' } };
  const gris = { style: 'thin', color: { argb: 'FFBFBFBF' } };
  const enc = ws.getRow(FILA_ENCABEZADO);
  enc.height = 33.75;
  CAMPOS.forEach((c, i) => {
    const cell = enc.getCell(COL_INICIAL + i);
    cell.font = { name: FUENTE, bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = { top: blanco, bottom: blanco, left: blanco, right: blanco };
  });

  datos.forEach((_, n) => {
    const row = ws.getRow(FILA_ENCABEZADO + 1 + n);
    CLAVES.forEach((k, i) => {
      const cell = row.getCell(COL_INICIAL + i);
      cell.font = { name: FUENTE, size: 11 };
      cell.alignment = { vertical: 'middle', wrapText: false };
      cell.border = { top: gris, bottom: gris, left: gris, right: gris };
    });
  });

  const ultima = FILA_ENCABEZADO + datos.length;

  const hasta = ultima + 200;
  const lista = (col, valores) => {
    const formula = `"${valores.join(',')}"`;
    for (let r = FILA_ENCABEZADO + 1; r <= hasta; r++) {
      ws.getCell(r, col).dataValidation = { type: 'list', allowBlank: true, formulae: [formula], showErrorMessage: false };
    }
  };
  if (CATEGORIAS.join(',').length < 250) lista(COL_INICIAL + CLAVES.indexOf('categoria'), CATEGORIAS);
  lista(COL_INICIAL + CLAVES.indexOf('nomenclatura'), NOMENCLATURAS);
  lista(COL_INICIAL + CLAVES.indexOf('tipo'), TIPOS);

  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

module.exports = { leerExcel, importarExcel, generarExcel, HOJA };
