const { app, BrowserWindow, dialog, Menu, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { Inventario } = require('./lib/db');
const { crearServidor } = require('./lib/servidor');
const { respaldoDelDia, snapshotLocal, respaldadoHoy } = require('./lib/respaldos');
const red = require('./lib/red');
const actualizador = require('./lib/actualizador');

const PUERTO = 47800;
let ventana = null;
let db = null;
let servidor = null;
let cerrando = false;

const archivoConfig = () => path.join(app.getPath('userData'), 'config.json');
function leerConfig() {
  try { return JSON.parse(fs.readFileSync(archivoConfig(), 'utf8')); } catch (_) { return {}; }
}
function guardarConfig(parcial) {
  const c = { ...leerConfig(), ...parcial };
  fs.mkdirSync(path.dirname(archivoConfig()), { recursive: true });
  fs.writeFileSync(archivoConfig(), JSON.stringify(c, null, 2));
  return c;
}

function crearVentana() {
  ventana = new BrowserWindow({
    width: 1400,
    height: 860,
    minWidth: 380,
    minHeight: 560,
    backgroundColor: '#ECE7D8',
    title: 'Inventario',
    icon: path.join(__dirname, 'public', 'icono.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  ventana.once('ready-to-show', () => {
    ventana.maximize();
    ventana.show();
  });
  ventana.webContents.on('before-input-event', (evento, entrada) => {
    if (entrada.type === 'keyDown' && entrada.key === 'F11') {
      evento.preventDefault();
      ventana.setFullScreen(!ventana.isFullScreen());
    }
  });
  ventana.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  ventana.on('closed', () => { ventana = null; });
  return ventana;
}

function paginaLocal(nombre) {
  return ventana.loadFile(path.join(__dirname, 'electron', nombre));
}

async function iniciarServidor() {
  const dirDatos = app.getPath('userData');
  db = new Inventario(path.join(dirDatos, 'inventario.db'));
  servidor = crearServidor({
    db,
    dirDatos,
    dirPublico: path.join(__dirname, 'public'),
    puerto: PUERTO,
    version: app.getVersion(),
    elegirCarpeta: async () => {
      const r = await dialog.showOpenDialog(ventana, { title: 'Carpeta de respaldo (Google Drive)', properties: ['openDirectory', 'createDirectory'] });
      return r.canceled ? null : r.filePaths[0];
    },
  });
  await servidor.escuchar();
  await ventana.loadURL(`http://127.0.0.1:${servidor.puerto}/`);
  preguntarFirewall();
}

async function preguntarFirewall() {
  if (await red.reglaFirewallExiste()) return;
  const cfg = leerConfig();
  if (cfg.noPreguntarFirewall) return;
  const r = await dialog.showMessageBox(ventana, {
    type: 'question',
    title: 'Conexión de otros equipos',
    message: 'Para que otro equipo pueda conectarse, Windows requiere una autorización única.',
    detail: 'Windows solicitará confirmación de administrador. Sin esta regla, otros equipos no podrán conectarse.',
    buttons: ['Autorizar ahora', 'Más tarde', 'No volver a preguntar'],
    defaultId: 0,
    cancelId: 1,
  });
  if (r.response === 0) await red.permitirFirewall(servidor.puerto);
  if (r.response === 2) guardarConfig({ noPreguntarFirewall: true });
}

async function iniciarCliente() {
  await paginaLocal('conectar.html');
}

async function arrancar() {
  crearVentana();
  const cfg = leerConfig();
  if (!cfg.modo) { await paginaLocal('modo.html'); return; }
  if (cfg.modo === 'servidor') await iniciarServidor();
  else await iniciarCliente();
  setTimeout(() => revisarActualizaciones(false), 4000);
}

async function revisarActualizaciones(manual) {
  if (!app.isPackaged || !process.env.PORTABLE_EXECUTABLE_FILE) {
    if (manual && ventana) dialog.showMessageBox(ventana, { type: 'info', title: 'Actualizaciones', message: 'Esta copia no es la versión portátil descargada, no se puede revisar.' });
    return;
  }
  let info;
  try { info = await actualizador.buscarNueva(app.getVersion()); } catch (e) {
    if (manual && ventana) dialog.showMessageBox(ventana, { type: 'warning', title: 'Actualizaciones', message: 'No se pudo revisar si hay una versión nueva.', detail: 'Verificá que este equipo tenga conexión a internet e intentá de nuevo.' });
    return;
  }
  if (!info) {
    if (manual && ventana) dialog.showMessageBox(ventana, { type: 'info', title: 'Actualizaciones', message: `Ya tenés instalada la versión más reciente (${app.getVersion()}).` });
    return;
  }
  if (!ventana) return;
  const r = await dialog.showMessageBox(ventana, {
    type: 'info',
    title: 'Actualización disponible',
    message: `Hay una versión nueva del programa (${info.version}). Tenés la ${app.getVersion()}.`,
    detail: 'Se descarga sola, el programa se cierra y vuelve a abrirse solo. En total puede tardar uno o dos minutos: no lo vuelvan a abrir a mano mientras tanto, aunque la pantalla esté un rato sin mostrar nada.',
    buttons: ['Actualizar ahora', 'Más tarde'],
    defaultId: 0,
    cancelId: 1,
  });
  if (r.response !== 0) return;
  try {
    const ps1 = await actualizador.descargarYPreparar(info.url);
    spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', ps1], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    cerrando = true;
    await cerrarTodo();
    app.exit(0);
  } catch (e) {
    if (ventana) {
      dialog.showMessageBox(ventana, {
        type: 'error', title: 'No se pudo actualizar',
        message: 'No se pudo descargar la actualización.',
        detail: `${e.message}\n\nPodés descargarla a mano desde la página de GitHub del proyecto y reemplazar el archivo.`,
      });
    }
  }
}

ipcMain.handle('revisar-actualizacion', () => revisarActualizaciones(true));
ipcMain.handle('elegir-modo', async (_e, modo) => {
  guardarConfig({ modo });
  if (modo === 'servidor') await iniciarServidor(); else await iniciarCliente();
});
ipcMain.handle('cambiar-modo', async () => {
  const r = await dialog.showMessageBox(ventana, {
    type: 'question', title: 'Tipo de equipo', message: '¿Cambiar el tipo de este equipo?',
    detail: 'La base de datos no se elimina. Solo cambia si este equipo aloja los datos (servidor) o se conecta a otro.',
    buttons: ['Cambiar', 'Cancelar'], defaultId: 1, cancelId: 1,
  });
  if (r.response !== 0) return false;
  guardarConfig({ modo: null });
  app.relaunch();
  cerrando = true;
  await cerrarTodo();
  app.exit(0);
  return true;
});
ipcMain.handle('buscar', async () => {
  const cfg = leerConfig();
  return red.buscarServidor(PUERTO, cfg.ultimoServidor ? [cfg.ultimoServidor.split(':')[0]] : []);
});
ipcMain.handle('probar', async (_e, ip) => {
  const limpio = String(ip || '').trim().replace(/^https?:\/\//, '').split(':')[0];
  if (!limpio) return null;
  return red.sondear(limpio, PUERTO, 2500);
});
ipcMain.handle('ultimo', () => leerConfig().ultimoServidor || null);
ipcMain.handle('conectar', async (_e, servidorInfo) => {
  guardarConfig({ ultimoServidor: `${servidorInfo.ip}:${servidorInfo.puerto}` });
  await ventana.loadURL(`http://${servidorInfo.ip}:${servidorInfo.puerto}/`);
});

async function cerrarTodo() {
  try {
    if (db) {
      try { snapshotLocal(db, app.getPath('userData')); } catch (_) { }
      if (db.ajuste('carpetaRespaldo') && !respaldadoHoy(db)) {
        try { await respaldoDelDia(db); } catch (_) { }
      }
    }
    if (servidor) await servidor.cerrar();
    if (db) db.cerrar();
  } catch (_) { }
  db = null;
  servidor = null;
}

app.on('before-quit', async (e) => {
  if (cerrando) return;
  cerrando = true;
  e.preventDefault();
  await cerrarTodo();
  app.exit(0);
});

app.on('window-all-closed', () => app.quit());

app.setName('Inventario');
app.setPath('userData', path.join(app.getPath('appData'), 'Inventario'));

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (ventana) { if (ventana.isMinimized()) ventana.restore(); ventana.focus(); }
  });
  Menu.setApplicationMenu(null);
  app.whenReady().then(arrancar);
}
