// Shell común de las páginas internas: menú lateral, barra superior, control de
// primer ingreso y cierre de sesión por inactividad.
import { api, fijarCsrf, irALogin } from './api.js';
import { icono, pintarIconos } from './iconos.js';
import { escapar } from './ui.js';

const ROL_TEXTO = { COLABORADOR: 'Colaborador', DIRECTOR: 'Director administrativo', ADMIN: 'Admincontable' };

export const textoRol = (r) => ROL_TEXTO[r] ?? r;

function hoyLargo() {
  const t = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Bogota' });
  return `Hoy es ${t}`;
}

const iniciales = (nombre) =>
  String(nombre).split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('');

export async function montarShell({ permitirOnboarding = false } = {}) {
  const me = await api('/auth/me');
  fijarCsrf(me.csrf);
  const u = me.usuario;
  if (!u.cuentaLista && !permitirOnboarding) {
    location.replace('/bienvenida');
    return new Promise(() => {});
  }

  const lateral = document.getElementById('lateral');
  const velo = document.querySelector('.velo');
  const superior = document.getElementById('superior');
  const actual = location.pathname;

  lateral.setAttribute('aria-label', 'Menú principal');
  lateral.innerHTML = `
    <div class="marca">${icono('marca')}<span>Talento Humano</span></div>
    <div class="perfil">
      <span class="avatar" aria-hidden="true">${escapar(iniciales(u.nombre))}</span>
      <div><div class="perfil__nombre">${escapar(u.nombre)}</div><div class="perfil__rol">${escapar(textoRol(u.rol))}</div></div>
    </div>
    <nav aria-label="Secciones"><ul class="nav">
      ${me.menu
        .map((m) => `<li><a href="${escapar(m.href)}" ${actual === m.href ? 'aria-current="page"' : ''}>${icono(m.icono)}<span>${escapar(m.texto)}</span></a></li>`)
        .join('')}
    </ul></nav>`;

  superior.innerHTML = `
    <button type="button" class="boton-icono menu-movil" id="abrir-menu" aria-label="Abrir menú" aria-controls="lateral" aria-expanded="false">${icono('menu')}</button>
    <div class="superior__saludo"><strong>Hola, ${escapar(u.saludo || u.nombre)}</strong><span>${escapar(hoyLargo())}</span></div>
    <div class="superior__acciones">
      ${u.cuentaLista ? `<a class="boton-icono" href="/cuenta" aria-label="Mi cuenta">${icono('usuario')}<span class="texto" aria-hidden="true">Mi cuenta</span></a>` : ''}
      <button type="button" class="boton-icono" id="salir" aria-label="Salir">${icono('salir')}<span class="texto" aria-hidden="true">Salir</span></button>
    </div>`;

  const btnMenu = document.getElementById('abrir-menu');
  const abrir = (si) => {
    lateral.dataset.abierto = String(si);
    velo.hidden = !si;
    btnMenu.setAttribute('aria-expanded', String(si));
    if (si) lateral.querySelector('a')?.focus();
  };
  btnMenu.addEventListener('click', () => abrir(lateral.dataset.abierto !== 'true'));
  velo.addEventListener('click', () => abrir(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && lateral.dataset.abierto === 'true') {
      abrir(false);
      btnMenu.focus();
    }
  });

  document.getElementById('salir').addEventListener('click', salir);
  vigilarInactividad(me.inactividadMin);
  pintarIconos();
  return me;
}

export async function salir(motivo) {
  try {
    await api('/auth/logout', { metodo: 'POST' });
  } catch {
    /* la sesión pudo haber vencido ya */
  }
  location.assign(typeof motivo === 'string' ? `/login?motivo=${motivo}` : '/login');
}

// Cierre por inactividad: aviso 2 minutos antes; el servidor también lo aplica.
function vigilarInactividad(minutos) {
  const total = minutos * 60_000;
  const avisoAntes = Math.min(2 * 60_000, total / 3);
  let ultimaActividad = Date.now();
  let ultimoPing = Date.now();
  let dialogo = null;

  const registrar = () => {
    if (dialogo) return; // con el aviso abierto, solo cuenta el botón
    ultimaActividad = Date.now();
  };
  for (const ev of ['pointerdown', 'keydown', 'scroll', 'touchstart']) {
    addEventListener(ev, registrar, { passive: true });
  }

  setInterval(async () => {
    const inactivo = Date.now() - ultimaActividad;
    if (inactivo >= total) {
      salir('inactividad');
      return;
    }
    if (inactivo >= total - avisoAntes && !dialogo) mostrarAviso();
    // Si el usuario está activo pero sin llamar a la API (p. ej. llenando un formulario),
    // se mantiene viva la sesión del servidor.
    if (inactivo < 60_000 && Date.now() - ultimoPing > Math.min(5 * 60_000, total / 2)) {
      ultimoPing = Date.now();
      api('/auth/me').catch(() => {});
    }
  }, 15_000);

  function mostrarAviso() {
    dialogo = document.createElement('dialog');
    dialogo.className = 'modal';
    dialogo.setAttribute('aria-labelledby', 'inact-titulo');
    dialogo.innerHTML = `<h2 id="inact-titulo">${icono('reloj')} ¿Sigue ahí?</h2>
      <p>Por seguridad, su sesión se cerrará en 2 minutos si no hay actividad.</p>
      <div class="formulario-acciones"><button type="button" class="btn" id="seguir">Seguir conectado</button>
      <button type="button" class="btn btn--secundario" id="cerrar-ya">Cerrar sesión</button></div>`;
    document.body.append(dialogo);
    dialogo.showModal();
    dialogo.querySelector('#seguir').addEventListener('click', async () => {
      try {
        await api('/auth/me');
        ultimaActividad = Date.now();
        ultimoPing = Date.now();
      } catch {
        irALogin('inactividad');
      }
      dialogo.close();
    });
    dialogo.querySelector('#cerrar-ya').addEventListener('click', () => salir());
    dialogo.addEventListener('close', () => {
      dialogo.remove();
      dialogo = null;
    });
  }
}
