(function () {
  const INV = window.INV;
  const { h, ico } = INV;
  const B = window.Busqueda;
  const C = window.Campos;
  const S = INV.S;

  const CORTA = { nomenclatura: 'Nomenclatura', tipo: 'Tipo', categoria: 'Categoría', codigo: 'Código', serie: 'No. Serie' };
  const etiqueta = (k) => CORTA[k] || C.ETIQUETA[k] || k;

  let pend = { valores: {}, texto: {} };
  let pop = null;
  let panelEl = null;
  const paneles = new Set();

  function copiar(f) {
    const valores = {};
    for (const [k, v] of Object.entries(f.valores || {})) if (v && v.length) valores[k] = [...v];
    const texto = {};
    for (const [k, v] of Object.entries(f.texto || {})) if (String(v || '').trim()) texto[k] = String(v);
    return { valores, texto };
  }

  function sincronizar() {
    pend = copiar(S.filtros);
    paneles.forEach((p) => p.refrescar());
    if (pop) pintarPopover();
  }

  function contextual(campo) {
    const f = { valores: pend.valores, texto: pend.texto, vacios: [], llenos: [] };
    return B.conteos(B.filtrar(S.base, f, campo), campo);
  }

  function valoresDe(campo, texto) {
    const ctx = contextual(campo);
    const mapa = new Map(ctx.valores);
    const sel = pend.valores[campo] || [];
    const q = B.norm(texto || '').trim();
    let items = INV.conteosDe(campo).map(([v]) => ({ v, n: mapa.get(v) || 0, on: sel.includes(v) }));
    if (q) items = items.filter((x) => B.norm(x.v).includes(q));
    items.sort((a, b) => (Number(b.on) - Number(a.on)) || (b.n - a.n) || a.v.localeCompare(b.v, 'es'));
    const vacias = (!q || 'vacias vacio'.includes(q)) && (ctx.vacios > 0 || sel.includes(''))
      ? [{ v: '', n: ctx.vacios, on: sel.includes(''), vacio: true }] : [];
    return [...vacias, ...items];
  }

  function alternar(campo, valor) {
    const cur = new Set(pend.valores[campo] || []);
    if (cur.has(valor)) cur.delete(valor); else cur.add(valor);
    if (cur.size) pend.valores[campo] = [...cur]; else delete pend.valores[campo];
    paneles.forEach((p) => p.refrescar());
    pintarPopover();
  }

  function renderLista(cont, campo, texto) {
    const items = valoresDe(campo, texto);
    const total = items.length;
    const vis = items.slice(0, 300);
    cont.replaceChildren(...(vis.length ? vis.map((x) => h('button', {
      type: 'button', class: 'pop-item' + (x.on ? ' on' : '') + (x.vacio ? ' vacio' : '') + (x.n === 0 && !x.on ? ' cero' : ''), 'data-v': x.v,
      onclick: () => alternar(campo, x.v),
    }, h('span', { class: 'caja' }, ico('check')), h('span', { class: 'txt' }, x.vacio ? 'Vacías' : x.v), h('span', { class: 'n' }, String(x.n)))) : [h('div', { class: 'pop-vacio' }, 'Sin valores que coincidan')]));
    if (total > 300) cont.appendChild(h('div', { class: 'pop-vacio' }, `${total - 300} más. Escriba para acotar.`));
    return items;
  }

  function cerrarPopover() {
    if (!pop) return;
    document.removeEventListener('mousedown', pop.fuera, true);
    pop.el.remove();
    pop = null;
  }

  function posicionar() {
    if (!pop) return;
    const r = pop.ancla.getBoundingClientRect();
    const el = pop.el;
    el.style.minWidth = Math.max(250, r.width) + 'px';
    const ancho = el.offsetWidth;
    el.style.left = Math.max(8, Math.min(r.left, window.innerWidth - ancho - 8)) + 'px';
    const alto = el.offsetHeight;
    const abajo = r.bottom + 4;
    el.style.top = (abajo + alto > window.innerHeight - 8 ? Math.max(8, r.top - alto - 4) : abajo) + 'px';
  }

  function pintarPopover() {
    if (!pop) return;
    const { campo, el, texto } = pop;
    const lista = h('div', { class: 'pop-lista' });
    const items = renderLista(lista, campo, texto());
    const sel = pend.valores[campo] || [];
    el.replaceChildren(
      h('div', { class: 'pop-cab' }, h('b', null, etiqueta(campo)), h('span', null, sel.length ? `${sel.length} seleccionado${sel.length === 1 ? '' : 's'}` : `${items.length} valores`)),
      lista,
      h('div', { class: 'pop-pie' },
        h('button', { type: 'button', class: 'btn mini', onclick: () => {
          pend.valores[campo] = [...new Set([...(pend.valores[campo] || []), ...items.map((x) => x.v)])];
          paneles.forEach((p) => p.refrescar());
          pintarPopover();
        } }, 'Seleccionar mostrados'),
        h('button', { type: 'button', class: 'btn mini', onclick: () => {
          delete pend.valores[campo];
          paneles.forEach((p) => p.refrescar());
          pintarPopover();
        } }, 'Limpiar')));
    posicionar();
  }

  function abrirPopover(campo, ancla, texto) {
    if (pop && pop.campo === campo) { pop.texto = texto; pintarPopover(); return; }
    cerrarPopover();
    const el = h('div', { class: 'pop', role: 'listbox' });
    document.body.appendChild(el);
    const fuera = (e) => { if (!el.contains(e.target) && !ancla.contains(e.target)) cerrarPopover(); };
    document.addEventListener('mousedown', fuera, true);
    pop = { campo, el, ancla, fuera, texto };
    pintarPopover();
  }

  function aplicar() {
    cerrarPopover();
    INV.ponerFiltros((f) => {
      f.valores = {};
      f.texto = {};
      for (const [k, v] of Object.entries(pend.valores)) if (v.length) f.valores[k] = [...v];
      for (const [k, v] of Object.entries(pend.texto)) if (String(v).trim()) f.texto[k] = String(v);
      f.vacios = [];
      f.llenos = [];
    });
  }

  function eliminar() {
    cerrarPopover();
    pend = { valores: {}, texto: {} };
    INV.limpiarFiltros();
  }

  function limpiarCampo(campo) {
    INV.ponerFiltros((f) => {
      delete f.valores[campo];
      if (f.texto) delete f.texto[campo];
      f.vacios = f.vacios.filter((c) => c !== campo);
      f.llenos = f.llenos.filter((c) => c !== campo);
    });
  }

  function filtrarPorValor(campo, valor) {
    INV.ponerFiltros((f) => { f.valores[campo] = [valor]; });
  }

  function construirPanel(cont, { alAplicar = null, extraAcciones = [] } = {}) {
    const campos = new Map();
    const grid = h('div', { class: 'pf-grid' });
    C.CAMPOS.forEach((c) => {
      const k = c.k;
      const input = h('input', { class: 'f-in', type: 'text', placeholder: 'Escribir para filtrar', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Filtrar ' + etiqueta(k) });
      const cuenta = h('span', { class: 'cuenta oculto' });
      const btn = h('button', { type: 'button', class: 'f-btn', title: 'Elegir valores', 'aria-label': 'Elegir valores de ' + etiqueta(k) }, ico('abajo'), cuenta);
      const caja = h('div', { class: 'f-celda' }, input, btn);
      const texto = () => input.value;
      input.addEventListener('input', () => {
        if (input.value.trim()) pend.texto[k] = input.value; else delete pend.texto[k];
        refrescarUno(k);
        abrirPopover(k, caja, texto);
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); aplicar(); if (alAplicar) alAplicar(); }
        else if (e.key === 'Escape' && pop) { e.preventDefault(); e.stopPropagation(); cerrarPopover(); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); abrirPopover(k, caja, texto); }
      });
      btn.addEventListener('click', () => {
        if (pop && pop.campo === k) cerrarPopover(); else abrirPopover(k, caja, texto);
      });
      const bloque = h('div', { class: 'pf-campo', 'data-k': k }, h('label', null, etiqueta(k)), caja);
      grid.appendChild(bloque);
      campos.set(k, { input, caja, cuenta });
    });

    function refrescarUno(k) {
      const c = campos.get(k);
      const n = (pend.valores[k] || []).length;
      c.caja.classList.toggle('activo', !!(n || String(pend.texto[k] || '').trim()));
      c.cuenta.textContent = String(n);
      c.cuenta.classList.toggle('oculto', n === 0);
    }
    function refrescar() {
      for (const [k, c] of campos) {
        if (document.activeElement !== c.input) c.input.value = pend.texto[k] || '';
        refrescarUno(k);
      }
    }

    const acciones = h('div', { class: 'pf-acciones' },
      h('button', { type: 'button', class: 'btn senal', id: 'btn-buscar-filtros', onclick: () => { aplicar(); if (alAplicar) alAplicar(); } }, ico('buscar'), 'Buscar'),
      h('button', { type: 'button', class: 'btn', id: 'btn-eliminar-filtros', onclick: () => { eliminar(); } }, ico('limpiarFiltro'), 'Eliminar filtros'),
      h('span', { class: 'relleno' }), ...extraAcciones);
    cont.replaceChildren(grid, acciones);
    const api = { refrescar };
    paneles.add(api);
    refrescar();
    return api;
  }

  function montarPanel(el) {
    panelEl = el;
    construirPanel(el, { alAplicar: () => alternarPanel(false), extraAcciones: [h('button', { type: 'button', class: 'btn cinta', onclick: () => alternarPanel(false) }, 'Cerrar')] });
  }

  function alternarPanel(abrir) {
    if (!panelEl) return;
    const mostrar = abrir === undefined ? panelEl.classList.contains('oculto') : abrir;
    if (mostrar) { pend = copiar(S.filtros); paneles.forEach((p) => p.refrescar()); }
    else cerrarPopover();
    panelEl.classList.toggle('oculto', !mostrar);
    INV.bus.emit('panel-filtros', mostrar);
    if (mostrar) { const primero = panelEl.querySelector('.f-in'); if (primero) primero.focus(); }
  }

  function abrirHojaMovil() {
    pend = copiar(S.filtros);
    const cont = h('div');
    const hoja = INV.abrirHoja({
      titulo: 'Filtros', rotulo: 'Por columna', clase: 'media', cuerpo: cont,
      alCerrar: () => { cerrarPopover(); paneles.delete(api); },
    });
    const api = construirPanel(cont, { alAplicar: () => hoja.cerrar() });
    return hoja;
  }

  const abierto = () => !!panelEl && !panelEl.classList.contains('oculto');

  INV.bus.on('filtros', sincronizar);
  INV.bus.on('datos', () => { if (pop) pintarPopover(); });

  INV.Filtros = { montarPanel, alternarPanel, abierto, abrirHojaMovil, limpiarCampo, filtrarPorValor, cerrarPopover, etiqueta };
})();
