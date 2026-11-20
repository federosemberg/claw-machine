# Grab Lab

Arcade de garra para una pantalla y un celular. La caja, la garra articulada y las esferas se renderizan con Three.js. Las pelotas tienen doce acabados 3D, entre ellos goma, fieltro, mármol y metal reflectante. Las seis variantes originales usan las imágenes de Higgsfield en el resultado del turno. Si el navegador no admite WebGL 2, se activa una vista desde arriba.

## Jugar

Necesitás Node.js 20 o posterior.

```sh
npm ci
npm start
```

1. Abrí [la máquina](http://localhost:3000) en la computadora y usá el botón superior derecho para ampliar solo la máquina. Presioná **Esc** para volver a la vista normal.
2. Esperá a que caigan las 102 pelotas y aparezca el QR. Conectá el celular a la misma red que la computadora. Escaneá el QR de la máquina con la cámara y abrí el enlace.
3. Deslizá el joystick para mover la garra hacia los lados, hacia atrás o hacia adelante. Tocá **Soltar garra** para intentar una captura.
4. Si la esfera llega a la salida, la pantalla muestra el resultado y, si la esfera contiene uno, su premio. Se puede volver a jugar desde cualquiera de los dos dispositivos.

También podés abrir el control desde la pantalla para probarlo en otra pestaña o jugar con **←**, **↑**, **↓**, **→** y **Espacio** cuando el celular esté desconectado.

## Configuración

| Variable | Uso | Valor inicial |
| --- | --- | --- |
| `GRIP_SENSITIVITY` | Entre 0 y 1. A mayor valor, la garra tolera más desalineación y sostiene mejor la esfera. | `0.65` |
| `PORT` | Puerto HTTP. | `3000` |
| `PUBLIC_ORIGIN` | URL pública o dirección de red que deben abrir los celulares al escanear el QR. | Se usa el host de la pantalla o la primera IPv4 local cuando la pantalla se abre en localhost. |

```sh
GRIP_SENSITIVITY=0.85 npm start
```

Para usar un dominio, configurá `PUBLIC_ORIGIN` y serví HTTP y WebSocket desde el mismo dominio. El proxy debe reenviar las conexiones WebSocket de `/live`.

## Premios

Cada sesión tiene una simulación propia en el servidor. Las pelotas chocan entre sí y con el gabinete en tres dimensiones. El agarre centra la esfera dentro de las mordazas y la lleva hasta la apertura de la salida con aceleración y frenado progresivos. El QR da acceso al control de esa sesión y admite un solo joystick conectado a la vez. Las sesiones y los premios asignados duran lo que dura el proceso.

El catálogo de demostración vive en `lib/prizes.js`. La simulación acepta un catálogo con un método `draw()`, asigna un premio al crear cada esfera de forma aleatoria y mantiene esa asignación en el servidor hasta que la esfera llega a la salida. Para incorporar un backoffice, se puede pasar un catálogo respaldado por datos persistentes en el punto de creación de partidas en `server.js`. Los premios actuales son de demostración y no tienen valor de canje.

Ejecutá `npm test` para verificar la sensibilidad y el ciclo de entrega y reinicio.

## Publicar en Netlify

Netlify publica la pantalla y el joystick. El servidor Node.js de partidas corre aparte porque mantiene la física y el estado de cada sesión en memoria y atiende las conexiones WebSocket.

1. Subí el proyecto a un repositorio Git y creá un **Web Service** en Render apuntando a ese repositorio. Usá `npm ci --omit=dev` como comando de build y `npm start` como comando de inicio. Mantené una única instancia.
2. En Netlify, importá el mismo repositorio. El archivo `netlify.toml` configura el comando de build y la carpeta `dist`.
3. En las variables de Netlify, agregá `GAME_SERVER_URL` con el origen HTTPS del servicio de Render, por ejemplo `https://grab-lab.onrender.com`. Ejecutá un deploy después de guardar la variable.
4. En el servicio de Render, configurá `PUBLIC_ORIGIN` con la URL HTTPS final de Netlify, por ejemplo `https://grab-lab.netlify.app`. Render usa esa URL en los QR y habilita el acceso desde ese origen. Si usás un dominio propio, usá ese dominio para ambos pasos de acceso a la pantalla.
5. Abrí la URL de Netlify y escaneá el QR. La pantalla y el joystick se conectan directamente al mismo servicio de Render.

Para una carga manual, ejecutá `npm ci` y `GAME_SERVER_URL=https://grab-lab.onrender.com npm run build:netlify` en tu máquina. Arrastrá la carpeta generada `dist/` a Netlify Drop y configurá `PUBLIC_ORIGIN` en Render con la URL que Netlify te asigne.
# claw-machine
