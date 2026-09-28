(function () {
  const INV = (window.INV = window.INV || {});

  function h(tag, attrs, ...hijos) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      }
    }
    const poner = (x) => {
      if (x === null || x === undefined || x === false) return;
      if (Array.isArray(x)) x.forEach(poner);
      else el.appendChild(x instanceof Node ? x : document.createTextNode(String(x)));
    };
    hijos.forEach(poner);
    return el;
  }

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const RUTAS = {
    buscar: '<circle cx="10" cy="10" r="6"/><path d="M15 15l6 6"/>',
    mas: '<path d="M12 4v16M4 12h16"/>',
    cerrar: '<path d="M5 5l14 14M19 5L5 19"/>',
    filtro: '<path d="M3 5h18M6 12h12M10 19h4"/>',
    duplicar: '<rect x="8" y="8" width="12" height="12"/><path d="M16 8V4H4v12h4"/>',
    papelera: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    editar: '<path d="M4 20l1-5L16 4l4 4L9 19z"/><path d="M14 6l4 4"/>',
    check: '<path d="M4 12l5 5L20 6"/>',
    alerta: '<path d="M12 3L2 21h20z"/><path d="M12 10v5M12 17.5v.5"/>',
    enlace: '<path d="M3 9a14 14 0 0 1 18 0M6 13a9 9 0 0 1 12 0M9.5 17a4 4 0 0 1 5 0M12 20.5v.5"/>',
    descarga: '<path d="M12 3v12M6 10l6 6 6-6M4 20h16"/>',
    subir: '<path d="M12 16V4M6 9l6-6 6 6M4 20h16"/>',
    disco: '<rect x="3" y="3" width="18" height="18"/><path d="M7 3v6h10V3M7 21v-7h10v7"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    chevron: '<path d="M9 5l7 7-7 7"/>',
    reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 3"/>',
    usuario: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-5 4-7 8-7s8 2 8 7"/>',
    luna: '<path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10z"/>',
    sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
    tabla: '<rect x="3" y="4" width="18" height="16"/><path d="M3 10h18M9 4v16"/>',
    separar: '<path d="M12 3v18M5 8l-3 4 3 4M19 8l3 4-3 4"/>',
    excel: '<path d="M5 3h10l4 4v14H5z"/><path d="M14 3v5h5M8 13l5 5M13 13l-5 5"/>',
    duplicados: '<rect x="3" y="3" width="11" height="11"/><rect x="10" y="10" width="11" height="11"/>',
    ojo: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    texto: '<path d="M4 20l6-16 6 16M6.5 14h7M17 7h4M19 5v4"/>',
    llave: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v4M21 12v3"/>',
    volver: '<path d="M9 5L3 11l6 6M3 11h12a6 6 0 0 1 6 6v2"/>',
    puntos: '<path d="M5 12h.01M12 12h.01M19 12h.01" style="stroke-width:3.6"/>',
    lote: '<path d="M4 6h16M4 12h10M4 18h6M17 15l3 3 3-3"/>',
    menos: '<path d="M5 12h14"/>',
    pin: '<path d="M12 17v5M9 3h6l-1 6 3 4H7l3-4z"/>',
    deshacer: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    rehacer: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
    ordenAsc: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    ordenDesc: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    ocultar: '<path d="M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.7 6.8A17 17 0 0 0 2 12s4 6 10 6a9.7 9.7 0 0 0 4.3-1"/>',
    copiar: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    abajo: '<path d="M6 9l6 6 6-6"/>',
    limpiarFiltro: '<path d="M3 5h18l-7 8v6l-4-2v-4z"/><path d="M17 17l4 4M21 17l-4 4"/>',
    refrescar: '<path d="M4 4v6h6"/><path d="M20 20v-6h-6"/><path d="M5.5 9A8 8 0 0 1 19 8M18.5 15a8 8 0 0 1-13.5 1"/>',
  };
  function ico(nombre, extra) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('class', 'ico' + (extra ? ' ' + extra : ''));
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = RUTAS[nombre] || '';
    return s;
  }
  const icoHtml = (nombre) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${RUTAS[nombre] || ''}</svg>`;

  const pad = (n, l = 3) => String(n).padStart(l, '0');
  function hace(ts) {
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 5) return 'ahora';
    if (s < 60) return `hace ${s} s`;
    const m = Math.round(s / 60);
    if (m < 60) return `hace ${m} min`;
    const hr = Math.round(m / 60);
    if (hr < 24) return `hace ${hr} h`;
    return `hace ${Math.round(hr / 24)} d`;
  }
  function fechaHora(ts) {
    const d = new Date(ts);
    return `${pad(d.getDate(), 2)}/${pad(d.getMonth() + 1, 2)}/${d.getFullYear()} ${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}`;
  }
  const hora = (ts) => { const d = new Date(ts); return `${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}`; };

  function sello(texto, { tipo = '', accion = null, dur = 4200, titulo = null } = {}) {
    let cont = document.getElementById('sellos');
    if (!cont) { cont = h('div', { id: 'sellos' }); document.body.appendChild(cont); }
    const el = h('div', { class: 'sello ' + tipo, style: { '--dur': dur + 'ms' }, role: 'status' },
      titulo ? h('b', null, titulo) : null, h('span', null, texto));
    if (accion) el.appendChild(h('button', { onclick: () => { accion.fn(); quitar(); } }, accion.texto));
    const quitar = () => el.remove();
    cont.appendChild(el);
    setTimeout(quitar, dur);
    return quitar;
  }

  const pila = [];
  function abrirHoja({ titulo, rotulo = '', clase = '', cuerpo, pie = null, alCerrar = null, sinCerrar = false, sello: st = null, minimizable = false }) {
    const velo = h('div', { class: 'velo' + (clase.includes('completa') ? ' completa' : '') });
    let chip = null;
    const btnMin = minimizable ? h('button', { class: 'minimizar', type: 'button', 'aria-label': 'Ver la tabla sin cerrar', title: 'Ver la tabla sin cerrar (los datos se conservan)', onclick: () => api.minimizar() }, ico('tabla')) : null;
    const btnCerrar = h('button', { class: 'cerrar', 'aria-label': 'Cerrar', title: 'Cerrar (Esc)', onclick: () => solicitarCierre() }, ico('cerrar'));
    const cab = h('div', { class: 'hoja-cab' },
      h('div', null, rotulo ? h('span', { class: 'rotulo' }, rotulo) : null, h('h2', null, titulo)),
      st ? h('span', { class: 'sello-estado ' + (st.clase || '') }, st.texto) : null,
      btnMin,
      sinCerrar ? null : btnCerrar);
    const cuerpoEl = h('div', { class: 'hoja-cuerpo' }, cuerpo);
    const pieEl = pie ? h('div', { class: 'hoja-pie' }, pie) : null;
    const hoja = h('div', { class: 'hoja ' + clase, role: 'dialog', 'aria-modal': 'true' }, cab, cuerpoEl, pieEl);
    velo.appendChild(hoja);
    document.body.appendChild(velo);
    const api = {
      el: hoja, velo, cuerpoEl, pieEl, cab, minimizada: false,
      cerrar() {
        const i = pila.indexOf(api);
        if (i >= 0) pila.splice(i, 1);
        if (chip) { chip.remove(); chip = null; }
        velo.remove();
        if (alCerrar) alCerrar();
      },
      minimizar() {
        if (!minimizable || api.minimizada) return;
        api.minimizada = true;
        velo.classList.add('minimizada');
        const i = pila.indexOf(api);
        if (i >= 0) pila.splice(i, 1);
        chip = h('button', { type: 'button', class: 'chip-min', onclick: () => api.restaurar() }, ico('editar'), h('span', null, `${titulo} · sin guardar`));
        document.body.appendChild(chip);
      },
      restaurar() {
        if (!api.minimizada) return;
        api.minimizada = false;
        velo.classList.remove('minimizada');
        if (chip) { chip.remove(); chip = null; }
        pila.push(api);
      },
      guardia: null,
      poner(nuevo) { cuerpoEl.replaceChildren(...[].concat(nuevo)); },
    };
    async function solicitarCierre() {
      if (api.guardia && !(await api.guardia())) return;
      api.cerrar();
    }
    api.solicitarCierre = solicitarCierre;
    pila.push(api);
    return api;
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && pila.length) {
      const menuAbierto = document.querySelector('.menu');
      if (menuAbierto) { menuAbierto.remove(); return; }
      const sug = document.querySelector('.sugs');
      if (sug) return;
      e.preventDefault();
      pila[pila.length - 1].solicitarCierre();
    }
  });

  function confirmar({ titulo, texto, ok = 'ACEPTAR', cancelar = 'CANCELAR', peligro = false, extra = null }) {
    return new Promise((resolve) => {
      let hecho = false;
      const fin = (v) => { if (hecho) return; hecho = true; hoja.cerrar(); resolve(v); };
      const hoja = abrirHoja({
        titulo, clase: 'chica', sinCerrar: true,
        cuerpo: [h('p', { style: { fontSize: '15px' } }, texto), extra],
        pie: [h('span', { class: 'relleno' }),
          h('button', { class: 'btn', onclick: () => fin(false) }, cancelar),
          h('button', { class: 'btn ' + (peligro ? 'peligro' : 'senal'), onclick: () => fin(true) }, ok)],
        alCerrar: () => { if (!hecho) { hecho = true; resolve(false); } },
      });
      hoja.pieEl.querySelector('.btn:last-child').focus();
    });
  }

  function crearMenu(items) {
    document.querySelectorAll('.menu').forEach((m) => m.remove());
    const m = h('div', { class: 'menu', role: 'menu' });
    items.filter(Boolean).forEach((it) => {
      if (it.sep) { m.appendChild(h('hr')); return; }
      m.appendChild(h('button', {
        role: 'menuitem',
        class: it.peligro ? 'peligro' : null,
        onclick: () => { m.remove(); it.fn(); },
      }, it.icono ? ico(it.icono) : null, it.texto, it.pista ? h('small', null, it.pista) : null));
    });
    document.body.appendChild(m);
    const cerrar = (e) => { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('mousedown', cerrar, true); } };
    setTimeout(() => document.addEventListener('mousedown', cerrar, true), 0);
    return m;
  }

  function menu(ancla, items) {
    const r = ancla.getBoundingClientRect();
    const m = crearMenu(items);
    const ancho = m.offsetWidth;
    m.style.top = Math.min(r.bottom + 6, window.innerHeight - m.offsetHeight - 8) + 'px';
    m.style.left = Math.max(8, Math.min(r.right - ancho, window.innerWidth - ancho - 8)) + 'px';
    return m;
  }

  function menuEn(x, y, items) {
    const m = crearMenu(items);
    m.style.top = Math.max(8, Math.min(y, window.innerHeight - m.offsetHeight - 8)) + 'px';
    m.style.left = Math.max(8, Math.min(x, window.innerWidth - m.offsetWidth - 8)) + 'px';
    return m;
  }

  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  function descargar(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: nombre });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  Object.assign(INV, { h, esc, ico, icoHtml, pad, hace, fechaHora, hora, sello, abrirHoja, confirmar, menu, menuEn, debounce, descargar });
})();
