(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Campos = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const CAMPOS = [
    { k: 'id_activo', l: 'ID Activo', w: 14.71 },
    { k: 'codigo', l: 'Código en Inventario', w: 25.57 },
    { k: 'categoria', l: 'Categoría de Activo', w: 39 },
    { k: 'nomenclatura', l: 'Nomenclatura Categoría de Activo', w: 27.57 },
    { k: 'nombre', l: 'Nombre', w: 43.14 },
    { k: 'descripcion', l: 'Descripción', w: 43.43 },
    { k: 'proveedor', l: 'Proveedor', w: 29.43 },
    { k: 'mac', l: 'MAC', w: 24.14 },
    { k: 'tipo', l: 'Tipo (Virtual o Fisico )', w: 26.29 },
    { k: 'ip', l: 'IP', w: 19.57 },
    { k: 'ubicacion', l: 'Ubicación', w: 25.43 },
    { k: 'cantidad', l: 'Cantidad', w: 18 },
    { k: 'departamento', l: 'Departamento', w: 37.14 },
    { k: 'responsable', l: 'Responsable', w: 27.29 },
    { k: 'marca', l: 'Marca', w: 23.14 },
    { k: 'modelo', l: 'Modelo', w: 32 },
    { k: 'serie', l: 'No. Serie', w: 37.14 },
  ];
  const CLAVES = CAMPOS.map((c) => c.k);
  const ETIQUETA = Object.fromEntries(CAMPOS.map((c) => [c.k, c.l]));
  const LETRA = Object.fromEntries(CAMPOS.map((c, i) => [c.k, String.fromCharCode(66 + i)]));

  const CATEGORIAS = [
    'Hardware - Equipamiento informático',
    'Software - Aplicaciones informáticas',
    'Redes de Comunicaciones',
    'Servicios',
  ];
  const NOMENCLATURAS = ['HW', 'COM', 'SW', 'S'];
  const TIPOS = ['Fisico', 'Virtual', 'N/A'];

  const ESPACIOS_COLS = ['categoria', 'nomenclatura', 'descripcion', 'proveedor', 'tipo', 'ubicacion', 'responsable', 'marca', 'modelo', 'cantidad'];
  const MAYUSCULAS_COLS = ['marca', 'modelo'];
  const UNIFICAR_COLS = ['categoria', 'nomenclatura', 'descripcion', 'proveedor', 'tipo', 'ubicacion', 'responsable'];
  const LIBRES_COLS = ['id_activo', 'codigo', 'nombre', 'ip', 'serie', 'departamento'];

  const colapsar = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const claveUnificar = (s) => colapsar(s).toUpperCase();

  function formatearMac(valor) {
    const original = String(valor == null ? '' : valor);
    const limpio = original.replace(/[\s:.\-]/g, '');
    if (!/^[0-9A-Fa-f]{12}$/.test(limpio)) return original.trim();
    return limpio.toUpperCase().match(/.{2}/g).join(':');
  }

  function canonizar(campo, valor, existentes) {
    if (campo === 'mac') return formatearMac(valor);
    if (LIBRES_COLS.includes(campo)) return String(valor == null ? '' : valor).trim();
    if (!ESPACIOS_COLS.includes(campo)) return valor;
    let v = colapsar(valor);
    if (MAYUSCULAS_COLS.includes(campo)) v = v.toUpperCase();
    if (UNIFICAR_COLS.includes(campo) && v && existentes && existentes[campo]) {
      const k = claveUnificar(v);
      const hit = existentes[campo].find((x) => claveUnificar(x) === k);
      if (hit) v = hit;
    }
    return v;
  }

  return {
    CAMPOS, CLAVES, ETIQUETA, LETRA, CATEGORIAS, NOMENCLATURAS, TIPOS,
    ESPACIOS_COLS, MAYUSCULAS_COLS, UNIFICAR_COLS, LIBRES_COLS,
    colapsar, claveUnificar, formatearMac, canonizar,
  };
});
