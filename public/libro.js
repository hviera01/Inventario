(function () {
  const INV = window.INV;
  const { h, esc, ico, pad } = INV;
  const { CAMPOS, LETRA } = window.Campos;
  const B = window.Busqueda;
  const S = INV.S;

  const LOTE = 400;
  const ANCHO_N = 3.6;
  const ANCHOS = { id_activo: 7.5, codigo: 8, categoria: 15.5, nomenclatura: 10.5, nombre: 13, descripcion: 14, proveedor: 11, mac: 12, tipo: 7, ip: 10.5, ubicacion: 12, cantidad: 7.5, departamento: 14, responsable: 11.5, marca: 10, modelo: 12, serie: 12 };
  const CORTA = { id_activo: 'ID Activo', codigo: 'Código', categoria: 'Categoría', nomenclatura: 'Nomenclatura', tipo: 'Tipo', serie: 'No. Serie' };
  const MONO = new Set(['id_activo', 'codigo', 'mac', 'ip', 'serie', 'modelo']);
  const corta = (k) => CORTA[k] || window.Campos.ETIQUETA[k];

  let visibles = LOTE;
  let contenedor = null;
  let tabla = null;
  let cuerpo = null;
  let firma = '';
  let ultimaMarca = null;
  const fijas = new Set();

  const esMovil = () => window.matchMedia('(max-width: 860px)').matches;
  const lista = (clave, def) => INV.guardado(clave, def).split(',').filter(Boolean);
  const ocultas = () => new Set(lista('inv.ocultas', ''));
  const ancladasCols = () => new Set(lista('inv.ancladas', 'nombre'));
  function anchosPropios() {
    try { return JSON.parse(INV.guardado('inv.anchos', '{}')) || {}; } catch (_) { return {}; }
  }
  const ancho = (k) => anchosPropios()[k] || ANCHOS[k];

  function columnas() {
    const o = ocultas();
    return CAMPOS.filter((c) => !o.has(c.k));
  }

  function izquierdas(cols) {
    const pin = ancladasCols();
    const izq = {};
    let acum = ANCHO_N;
    let fin = null;
    for (const c of cols) {
      if (!pin.has(c.k)) continue;
      izq[c.k] = acum;
      acum += ancho(c.k);
      fin = c.k;
    }
    return { izq, fin };
  }

  function guardarLista(clave, set) { INV.guardar(clave, [...set].join(',')); }

  function filaHtml(f, cols, izq, fin, esFija) {
    const n = INV.numeroDe(f.id);
    const info = S.dupInfo.get(f.id);
    const rec = S.recientes.get(f.id);
    const cabeza = cols.some((c) => c.k === 'nombre') ? 'nombre' : cols[0] && cols[0].k;
    const cls = [
      S.activoId === f.id ? 'activa' : '', S.seleccion.has(f.id) ? 'sel' : '', S.recienteIds.has(f.id) ? 'nueva' : '',
      esFija ? 'fija' : '', info && info.ini ? 'grupo-ini' : '',
    ].filter(Boolean).join(' ');
    const celdas = cols.map((c) => {
      const k = c.k;
      const cl = [
        'k-' + k, MONO.has(k) ? 'mono' : '', k in izq ? 'anclada' : '', k === fin ? 'anclada-fin' : '',
        S.activoId === f.id && S.celda === k ? 'celda-sel' : '', info && info.campos.has(k) ? 'dup' : '',
      ].filter(Boolean).join(' ');
      const st = k in izq ? ` style="left:${izq[k]}rem"` : '';
      const quien = rec && k === cabeza ? `<span class="quien">${esc(rec.quien)}</span>` : '';
      return `<td class="${cl}"${st}>${esc(String(f[k] || ''))}${quien}</td>`;
    }).join('');
    const g = info ? ` g${info.grupo % 6}` : '';
    return `<tr data-id="${f.id}" class="${cls}"><td class="n${g}" title="Clic para seleccionar la fila">${pad(n)}</td>${celdas}</tr>`;
  }

  function estructuraHtml(cols, izq, fin) {
    const suma = ANCHO_N + cols.reduce((s, c) => s + ancho(c.k), 0);
    const pinSvg = '<svg class="ico chincheta" viewBox="0 0 24 24"><path d="M12 17v5M9 3h6l-1 6 3 4H7l3-4z"/></svg>';
    const extra = (k) => (k in izq ? ` anclada${k === fin ? ' anclada-fin' : ''}` : '');
    const izqSt = (k) => (k in izq ? ` style="left:${izq[k]}rem"` : '');
    const colgroup = `<colgroup><col style="width:${ANCHO_N}rem">${cols.map((c) => `<col style="width:${ancho(c.k)}rem">`).join('')}</colgroup>`;
    const cab = `<tr class="cab"><th class="n" data-orden="__orden" title="Orden original">N°</th>${cols.map((c) => `<th data-k="${c.k}" class="k-${c.k}${extra(c.k)}"${izqSt(c.k)}><div class="th-in" data-orden="${c.k}" title="${esc(c.l)} · clic para ordenar · clic derecho para más opciones"><span class="letra">${LETRA[c.k]}</span><span class="txt">${esc(corta(c.k))}</span><span class="flecha"></span>${c.k in izq ? pinSvg : ''}<span class="res" data-res="${c.k}"></span></div></th>`).join('')}</tr>`;
    return `<table class="tabla" style="width:${suma}rem">${colgroup}<thead>${cab}</thead><tbody></tbody></table>`;
  }

  function construir(cols, izq, fin) {
    contenedor.innerHTML = estructuraHtml(cols, izq, fin);
    tabla = contenedor.querySelector('table');
    cuerpo = tabla.tBodies[0];
    const cab = tabla.querySelector('tr.cab');
    tabla.style.setProperty('--h-cab', cab.offsetHeight + 'px');
  }

  function actualizarCabecera() {
    if (!tabla) return;
    tabla.querySelectorAll('tr.cab .th-in').forEach((el) => {
      const k = el.dataset.orden;
      const f = el.querySelector('.flecha');
      if (f) f.textContent = S.orden && S.orden.campo === k ? (S.orden.dir === 1 ? '▲' : '▼') : '';
    });
  }

  function medirFijas() {
    if (!tabla) return;
    const cab = tabla.querySelector('tr.cab');
    let top = cab.offsetHeight;
    tabla.style.setProperty('--h-cab', cab.offsetHeight + 'px');
    tabla.querySelectorAll('tbody tr.fija').forEach((tr) => {
      tr.querySelectorAll('td').forEach((td) => { td.style.top = top + 'px'; });
      top += tr.offsetHeight;
    });
  }

  function pintarCuerpo(cols, izq, fin) {
    const filas = S.resultado.filas;
    const ancladas = filas.filter((f) => fijas.has(f.id));
    const resto = filas.filter((f) => !fijas.has(f.id));
    const tope = Math.min(resto.length, visibles);
    let html = ancladas.map((f) => filaHtml(f, cols, izq, fin, true)).join('');
    html += resto.slice(0, tope).map((f) => filaHtml(f, cols, izq, fin, false)).join('');
    const span = cols.length + 1;
    if (!filas.length) {
      html = `<tr class="fila-mensaje"><td colspan="${span}">Ningún registro coincide con la búsqueda o los filtros.<br><button type="button" class="btn" data-quitar-filtros="1">Quitar filtros</button></td></tr>`;
    } else if (resto.length > tope) {
      html += `<tr class="fila-mensaje"><td colspan="${span}"><button type="button" class="btn" data-mas="1">Mostrar ${Math.min(LOTE, resto.length - tope)} más · ${resto.length - tope} restantes</button></td></tr>`;
    }
    cuerpo.innerHTML = html;
    medirFijas();
    setTimeout(() => cuerpo && cuerpo.querySelectorAll('tr.nueva').forEach((r) => r.classList.remove('nueva')), 2000);
  }

  function pintarTarjetas() {
    tabla = null;
    cuerpo = null;
    firma = '';
    const filas = S.resultado.filas.slice(0, visibles);
    if (!S.resultado.filas.length) {
      contenedor.replaceChildren(h('div', { class: 'vacio-libro' }, h('div', null, h('h2', null, 'Sin resultados'), h('p', null, 'Ningún registro coincide con la búsqueda o los filtros.'),
        h('div', { class: 'fila-btn' }, h('button', { class: 'btn', onclick: () => INV.bus.emit('accion', 'quitar-filtros') }, 'Quitar filtros')))));
      return;
    }
    const fila = (t, v) => (String(v || '').trim() ? `<dt>${t}</dt><dd>${esc(v)}</dd>` : '');
    const html = filas.map((f) => {
      const info = S.dupInfo.get(f.id);
      const titulo = f.nombre || f.descripcion || 'Sin nombre';
      return `<article class="tarjeta${info ? ' dup' : ''}" data-id="${f.id}"><div class="cab"><b>${esc(titulo)}</b><span>${pad(INV.numeroDe(f.id))}</span></div>${f.nombre && f.descripcion ? `<div class="desc">${esc(f.descripcion)}</div>` : ''}<dl>${fila('Marca', [f.marca, f.modelo].filter(Boolean).join(' · '))}${fila('MAC', f.mac)}${fila('IP', f.ip)}${fila('Serie', f.serie)}${fila('Ubicación', f.ubicacion)}${fila('Departamento', f.departamento)}${fila('Responsable', f.responsable)}${fila('Proveedor', f.proveedor)}</dl></article>`;
    }).join('');
    const mas = S.resultado.filas.length > visibles ? `<button type="button" class="btn" style="width:100%" data-mas="1">Mostrar más</button>` : '';
    contenedor.innerHTML = `<div class="tarjetas">${html}${mas}</div>`;
  }

  function pintar() {
    if (!contenedor) return;
    if (INV.Celdas && INV.Celdas.activo()) { INV.Celdas.diferir(); return; }
    if (S.cargando) { contenedor.innerHTML = ''; tabla = null; firma = ''; return; }
    if (!S.activos.length) { contenedor.replaceChildren(vacio()); tabla = null; firma = ''; return; }
    if (esMovil()) { pintarTarjetas(); return; }
    const cols = columnas();
    const { izq, fin } = izquierdas(cols);
    const nueva = JSON.stringify([cols.map((c) => [c.k, ancho(c.k)]), Object.keys(izq)]);
    if (!tabla || firma !== nueva || !contenedor.contains(tabla)) { construir(cols, izq, fin); firma = nueva; }
    actualizarCabecera();
    pintarCuerpo(cols, izq, fin);
  }

  function vacio() {
    return h('div', { class: 'vacio-libro' }, h('div', null,
      h('div', { html: '<svg viewBox="0 0 320 120" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><rect x="6" y="8" width="308" height="30" rx="7"/><rect x="6" y="46" width="308" height="30" rx="7"/><rect x="6" y="84" width="308" height="30" rx="7"/><path d="M22 23h26M22 61h26M22 99h26M270 23h28M270 61h28M270 99h28" stroke-width="5"/></svg>' }),
      h('h2', null, 'Sin registros'),
      h('p', null, 'Importe el archivo Excel del inventario para cargar todos los activos, o agregue el primer registro manualmente.'),
      h('div', { class: 'fila-btn' },
        h('button', { class: 'btn senal', onclick: () => INV.bus.emit('accion', 'importar') }, ico('subir'), 'Importar Excel'),
        h('button', { class: 'btn', onclick: () => INV.bus.emit('accion', 'nuevo') }, ico('mas'), 'Agregar registro'))));
  }

  function alternarSel(id, forzar) {
    const on = forzar === undefined ? !S.seleccion.has(id) : forzar;
    if (on) S.seleccion.add(id); else S.seleccion.delete(id);
  }

  function ponerActiva(id, { desplazar = false } = {}) {
    S.activoId = id;
    if (contenedor) {
      contenedor.querySelectorAll('tr.activa').forEach((r) => r.classList.remove('activa'));
      const tr = id ? contenedor.querySelector(`tr[data-id="${id}"]`) : null;
      if (tr) {
        tr.classList.add('activa');
        if (desplazar && tr.scrollIntoView) tr.scrollIntoView({ block: 'nearest' });
      }
    }
    if (INV.Celdas) INV.Celdas.marcar();
    INV.bus.emit('activa');
  }

  function actualizarSeleccionVisual() {
    if (contenedor) {
      contenedor.querySelectorAll('tr[data-id]').forEach((tr) => tr.classList.toggle('sel', S.seleccion.has(tr.dataset.id)));
    }
    INV.bus.emit('seleccion');
  }

  function ordenar(campo, dir) {
    if (dir === null) S.orden = null;
    else S.orden = { campo, dir };
    INV.recalcular();
  }

  function alternarOrden(campo) {
    if (campo === '__orden') { ordenar(null, null); return; }
    if (!S.orden || S.orden.campo !== campo) ordenar(campo, 1);
    else if (S.orden.dir === 1) ordenar(campo, -1);
    else ordenar(null, null);
  }

  function copiarTexto(texto) {
    const ok = () => INV.sello('Valor copiado', { tipo: 'bien', dur: 1800 });
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(texto).then(ok, () => {}); return; }
    const t = h('textarea', { value: texto, style: { position: 'fixed', opacity: '0' } });
    document.body.appendChild(t);
    t.select();
    document.execCommand('copy');
    t.remove();
    ok();
  }

  function anclarFila(id) {
    if (fijas.has(id)) fijas.delete(id); else fijas.add(id);
    pintar();
  }

  function alternarAncladaCol(k) {
    const p = ancladasCols();
    if (p.has(k)) p.delete(k); else p.add(k);
    guardarLista('inv.ancladas', p);
    firma = '';
    pintar();
  }

  function ocultarCol(k) {
    const o = ocultas();
    if (o.size >= CAMPOS.length - 1) return;
    o.add(k);
    guardarLista('inv.ocultas', o);
    pintar();
  }

  function restablecerAncho(k) {
    const a = anchosPropios();
    delete a[k];
    INV.guardar('inv.anchos', JSON.stringify(a));
    firma = '';
    pintar();
  }

  function menuColumna(k, x, y) {
    const pin = ancladasCols().has(k);
    INV.menuEn(x, y, [
      { icono: 'ordenAsc', texto: 'Ordenar de A a Z', fn: () => ordenar(k, 1) },
      { icono: 'ordenDesc', texto: 'Ordenar de Z a A', fn: () => ordenar(k, -1) },
      S.orden && S.orden.campo === k ? { icono: 'cerrar', texto: 'Quitar orden', fn: () => ordenar(null, null) } : null,
      { sep: true },
      { icono: 'pin', texto: pin ? 'Desanclar columna' : 'Anclar columna', fn: () => alternarAncladaCol(k) },
      { icono: 'ocultar', texto: 'Ocultar columna', fn: () => ocultarCol(k) },
      { icono: 'tabla', texto: 'Restablecer ancho', fn: () => restablecerAncho(k) },
      INV.filtroDe(k) ? { sep: true } : null,
      INV.filtroDe(k) ? { icono: 'limpiarFiltro', texto: 'Quitar filtro de la columna', fn: () => INV.Filtros.limpiarCampo(k) } : null,
    ]);
  }

  function menuFila(id, campo, x, y) {
    const f = S.porId.get(id);
    if (!f) return;
    const valor = campo ? String(f[campo] || '') : '';
    const varias = S.seleccion.has(id) && S.seleccion.size > 1;
    const emitir = (accion, extra = {}) => () => INV.bus.emit('fila-accion', { accion, id, ...extra });
    const info = S.dupInfo.get(id);
    INV.menuEn(x, y, [
      { icono: 'editar', texto: 'Abrir ficha', pista: 'Ctrl+E', fn: emitir('editar') },
      campo && INV.Celdas.habilitado() ? { icono: 'editar', texto: 'Editar celda', pista: 'F2', fn: () => INV.Celdas.iniciar(id, campo) } : null,
      campo && valor ? { icono: 'copiar', texto: 'Copiar valor', fn: () => copiarTexto(valor) } : null,
      { sep: true },
      campo ? { icono: 'filtro', texto: valor ? 'Filtrar por este valor' : 'Filtrar las celdas vacías', fn: () => INV.Filtros.filtrarPorValor(campo, valor) } : null,
      campo && INV.filtroDe(campo) ? { icono: 'limpiarFiltro', texto: 'Quitar filtro de la columna', fn: () => INV.Filtros.limpiarCampo(campo) } : null,
      { sep: true },
      { icono: 'mas', texto: 'Insertar fila debajo', fn: emitir('insertar') },
      { icono: 'duplicar', texto: 'Duplicar fila', pista: 'Ctrl+D', fn: emitir('duplicar') },
      { icono: 'pin', texto: fijas.has(id) ? 'Desanclar fila' : 'Anclar fila arriba', fn: () => anclarFila(id) },
      B.separarDepartamento(f.departamento) ? { icono: 'separar', texto: 'Separar departamento y responsable', fn: emitir('separar') } : null,
      info ? { icono: 'check', texto: 'Marcar duplicado como correcto', fn: emitir('ignorar-dup') } : null,
      { sep: true },
      varias ? { icono: 'lote', texto: `Editar un campo en ${S.seleccion.size} filas…`, fn: () => INV.bus.emit('accion', 'lote') } : null,
      { icono: 'papelera', texto: varias ? `Eliminar ${S.seleccion.size} filas` : 'Eliminar fila', peligro: true, pista: 'Ctrl+Supr', fn: emitir('eliminar') },
    ]);
  }

  function iniciarAjuste(e, k) {
    e.preventDefault();
    e.stopPropagation();
    const col = tabla && tabla.querySelectorAll('colgroup col')[[...tabla.querySelectorAll('tr.cab th[data-k]')].findIndex((th) => th.dataset.k === k) + 1];
    if (!col) return;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 14;
    const x0 = e.clientX;
    const w0 = ancho(k);
    const mover = (ev) => {
      const w = Math.max(4, Math.min(60, w0 + (ev.clientX - x0) / rem));
      col.style.width = w + 'rem';
      const suma = ANCHO_N + columnas().reduce((s, c) => s + (c.k === k ? w : ancho(c.k)), 0);
      tabla.style.width = suma + 'rem';
      col.dataset.w = String(w);
    };
    const soltar = () => {
      document.removeEventListener('mousemove', mover);
      document.removeEventListener('mouseup', soltar);
      if (col.dataset.w) {
        const a = anchosPropios();
        a[k] = Number(col.dataset.w);
        INV.guardar('inv.anchos', JSON.stringify(a));
        firma = '';
        pintar();
      }
    };
    document.addEventListener('mousemove', mover);
    document.addEventListener('mouseup', soltar);
  }

  function alClick(e) {
    if (e.target.closest('.celda-edit,.f-celda')) return;
    if (e.target.closest('[data-mas]')) { visibles += LOTE; pintar(); return; }
    if (e.target.closest('[data-quitar-filtros]')) { INV.bus.emit('accion', 'quitar-filtros'); return; }
    const tarjeta = e.target.closest('.tarjeta');
    if (tarjeta) { ponerActiva(tarjeta.dataset.id); INV.bus.emit('fila-accion', { accion: 'editar', id: tarjeta.dataset.id }); return; }
    const thin = e.target.closest('.th-in, th.n[data-orden]');
    if (thin && !e.target.closest('.res')) { alternarOrden(thin.dataset.orden); return; }
    const tr = e.target.closest('tbody tr[data-id]');
    if (!tr) return;
    const id = tr.dataset.id;
    if (e.target.closest('td.n')) {
      if (e.shiftKey && ultimaMarca) {
        const ids = S.resultado.filas.map((f) => f.id);
        const a = ids.indexOf(ultimaMarca), b = ids.indexOf(id);
        if (a >= 0 && b >= 0) ids.slice(Math.min(a, b), Math.max(a, b) + 1).forEach((x) => alternarSel(x, true));
      } else if (e.ctrlKey || e.metaKey) {
        alternarSel(id);
      } else if (S.seleccion.size === 1 && S.seleccion.has(id)) {
        S.seleccion.clear();
      } else {
        S.seleccion.clear();
        S.seleccion.add(id);
      }
      ultimaMarca = id;
      ponerActiva(id);
      actualizarSeleccionVisual();
      return;
    }
    const td = e.target.closest('td');
    const m = td && /(?:^|\s)k-([a-z_]+)/.exec(td.className);
    ponerActiva(id);
    if (m && INV.Celdas.habilitado()) INV.Celdas.seleccionar(id, m[1], { desplazar: false });
    else if (S.celda) INV.Celdas.limpiarSeleccion();
  }

  function alDoble(e) {
    if (e.target.closest('td.n,th,.celda-edit,.f-celda')) return;
    const tr = e.target.closest('tbody tr[data-id]');
    if (tr) INV.bus.emit('fila-accion', { accion: 'editar', id: tr.dataset.id });
  }

  function alContexto(e) {
    if (e.target.closest('.celda-edit,.f-celda')) return;
    const th = e.target.closest('thead th[data-k]');
    if (th) { e.preventDefault(); menuColumna(th.dataset.k, e.clientX, e.clientY); return; }
    const tr = e.target.closest('tbody tr[data-id]');
    if (!tr) return;
    e.preventDefault();
    const id = tr.dataset.id;
    const td = e.target.closest('td');
    const m = td && /(?:^|\s)k-([a-z_]+)/.exec(td.className);
    ponerActiva(id);
    if (m && INV.Celdas.habilitado()) INV.Celdas.seleccionar(id, m[1], { desplazar: false });
    menuFila(id, m ? m[1] : null, e.clientX, e.clientY);
  }

  function alMousedown(e) {
    const r = e.target.closest('.res');
    if (r) iniciarAjuste(e, r.dataset.res);
  }

  function mover(delta) {
    const ids = S.resultado.filas.map((f) => f.id);
    if (!ids.length) return;
    let i = ids.indexOf(S.activoId);
    i = i < 0 ? (delta > 0 ? 0 : ids.length - 1) : Math.max(0, Math.min(ids.length - 1, i + delta));
    if (i >= visibles) { visibles = i + LOTE; pintar(); }
    ponerActiva(ids[i], { desplazar: true });
  }

  function alTecla(e) {
    if (e.target.closest('input,textarea,select,[contenteditable]') || document.querySelector('.velo')) return false;
    if (INV.Celdas.alTecla(e)) return true;
    if (e.key === 'ArrowDown') { mover(1); return true; }
    if (e.key === 'ArrowUp') { mover(-1); return true; }
    if (e.key === 'PageDown') { mover(10); return true; }
    if (e.key === 'PageUp') { mover(-10); return true; }
    if (e.key === 'Home') { mover(-1e9); return true; }
    if (e.key === 'End') { mover(1e9); return true; }
    if (e.key === 'Enter' && S.activoId) { INV.bus.emit('fila-accion', { accion: 'editar', id: S.activoId }); return true; }
    if (e.key === ' ' && S.activoId) { alternarSel(S.activoId); ultimaMarca = S.activoId; actualizarSeleccionVisual(); return true; }
    if (e.key === 'Delete' && (S.seleccion.size || S.activoId) && (!INV.Celdas.habilitado() || e.ctrlKey || e.metaKey || e.shiftKey)) { INV.bus.emit('fila-accion', { accion: 'eliminar', id: S.activoId }); return true; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e' && S.activoId) { INV.bus.emit('fila-accion', { accion: 'editar', id: S.activoId }); return true; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && S.activoId) { INV.bus.emit('fila-accion', { accion: 'duplicar', id: S.activoId }); return true; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { S.resultado.filas.forEach((f) => alternarSel(f.id, true)); actualizarSeleccionVisual(); return true; }
    return false;
  }

  function montar(el) {
    contenedor = el;
    INV.Celdas.montar(el);
    el.addEventListener('click', alClick);
    el.addEventListener('dblclick', alDoble);
    el.addEventListener('contextmenu', alContexto);
    el.addEventListener('mousedown', alMousedown);
    el.addEventListener('scroll', () => INV.Filtros.cerrarPopover(), { passive: true });
    INV.bus.on('resultado', () => { visibles = LOTE; pintar(); });
    window.matchMedia('(max-width: 860px)').addEventListener('change', () => { firma = ''; pintar(); });
    pintar();
  }

  function irA(id) {
    const ids = S.resultado.filas.map((f) => f.id);
    const i = ids.indexOf(id);
    if (i < 0) return false;
    if (i >= visibles) { visibles = i + LOTE; pintar(); }
    ponerActiva(id, { desplazar: true });
    return true;
  }

  INV.Libro = { montar, pintar, alTecla, ponerActiva, irA, actualizarSeleccionVisual, mover, columnas, anclarFila, copiarTexto };
})();
