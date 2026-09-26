# Inventario

Aplicación de escritorio y web para llevar el inventario de activos de TI. Reemplaza el trabajo sobre una hoja de Excel compartida: una sola base de datos, dos o más personas trabajando al mismo tiempo, búsqueda inteligente, control de duplicados y exportación al mismo formato del Excel original.

## Descarga

El programa portátil para Windows está en la sección **Releases** del repositorio. No requiere instalación: se descarga `Inventario.exe` y se ejecuta.

## Funciones principales

- Tabla con todas las columnas del Excel, con líneas entre celdas, columnas ancladas, ocultables y ajustables.
- Filtros por columna (texto y selección múltiple de valores) en un panel desplegable.
- Búsqueda general tolerante a errores de escritura; reconoce MAC en cualquier formato.
- Ficha de registro a pantalla completa, con sugerencias de valores ya usados y aviso inmediato de MAC, IP o serie repetidas.
- Duplicados visibles dentro de la misma tabla, para corregirlos en su lugar.
- Separación de «Departamento/Responsable» con vista previa.
- Deshacer y rehacer general (botones, Ctrl+Z y Ctrl+Y).
- Registros creados por cada usuario agrupados en su propio bloque.
- Normalización de datos: Marca y Modelo en mayúsculas, MAC en formato AA:BB:CC:DD:EE:FF, espacios sobrantes y variantes de mayúsculas.
- Importación y exportación a Excel (tabla con el estilo del archivo original y listas desplegables).
- Base de prueba con restablecimiento a datos reales y copia automática previa.
- Respaldo diario a una carpeta (por ejemplo, la de Google Drive) y copias automáticas locales.
- Acceso desde otros equipos, tabletas y celulares por la red local, con PIN.
- Aviso de versión nueva: al abrir el programa, revisa si hay una versión más reciente y, si la hay, ofrece abrir la página de descarga (no se actualiza solo).

## Tecnología

| Área | Tecnología |
| --- | --- |
| Lenguaje | JavaScript (Node.js en el servidor, JavaScript sin frameworks en el navegador) |
| Programa de escritorio | Electron 44 |
| Base de datos | SQLite (módulo `node:sqlite`, incluido en Node y Electron) |
| Servidor | Módulo `http` de Node.js, API REST en JSON y eventos en tiempo real (Server-Sent Events) |
| Interfaz | HTML, CSS y JavaScript propios; tipografías Geist y Geist Mono empaquetadas localmente |
| Excel | ExcelJS |
| Código QR | qrcode |
| Empaquetado | electron-builder (ejecutable portátil de Windows) |
| Pruebas | Node Test Runner y jsdom |

## Arquitectura

- Un equipo actúa como **servidor**: ejecuta el programa, guarda la base de datos y atiende a los demás.
- Los otros equipos abren el programa en modo **secundario** (busca al servidor solo en la red) o entran desde el navegador con la dirección que muestra el servidor.
- Todo funciona sin internet, por ejemplo con el punto de acceso personal de un teléfono.
- La base es un único archivo SQLite en la carpeta de datos del programa del equipo servidor (`%APPDATA%\Inventario\inventario.db`).
- Las escrituras usan control de versión por registro para detectar cambios simultáneos de dos usuarios sobre la misma fila.

## Actualización y desinstalación

Es un archivo portátil, no un instalador: no queda registrado en "Aplicaciones y características" de Windows. Desinstalarlo es borrar el archivo `.exe` y, si se quiere borrar también la base de datos, la carpeta `%APPDATA%\Inventario`.

Cada vez que se abre el programa revisa en segundo plano si hay una versión más nueva publicada en este repositorio. Si la hay, avisa y ofrece abrir la página de descarga; ahí se baja el `.exe` nuevo a mano y se reemplaza el archivo, igual que la primera vez. El programa no se reemplaza ni se reinicia solo.

## Uso

1. En el equipo principal, abrir `Inventario.exe` y elegir «Equipo servidor».
2. Importar el archivo Excel desde el menú (queda como base de prueba hasta restablecerla).
3. Menú › Conexión de otro equipo: autorizar el firewall una vez y compartir la dirección o el código QR y el PIN.
4. En el equipo secundario, abrir `Inventario.exe` y elegir «Equipo secundario», o abrir la dirección en el navegador.

Atajos principales: `F1` ayuda, `Ctrl+K` buscar, `Alt+N` nuevo registro, `Ctrl+Z` / `Ctrl+Y` deshacer y rehacer, `Ctrl+1` / `Ctrl+2` tamaño del texto, `F11` pantalla completa.

## Desarrollo

```
npm install
npm start
npm test
npm run dist
```

`npm run dist` genera el ejecutable portátil en la carpeta `dist`.

## Estructura

```
main.js            Proceso principal de Electron
preload.js         Puente seguro para las pantallas de arranque
electron/          Pantallas de selección de equipo y búsqueda de servidor
lib/               Servidor, base de datos, Excel, normalización, búsqueda, red y respaldos
public/            Interfaz web (HTML, CSS, JavaScript y fuentes)
test/              Pruebas automáticas
```
