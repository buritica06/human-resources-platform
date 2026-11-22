// Inicio. Cada módulo activo aporta sus tarjetas (último volante, saldo de vacaciones,
// solicitudes en curso…) con un script que exporta montar(contenedor, me).
import { montarShell, textoRol } from './shell.js';
import { icono } from './iconos.js';
import { escapar } from './ui.js';

const me = await montarShell();
const zona = document.getElementById('widgets');
const esAdmin = me.usuario.rol === 'ADMIN';
const tiene = (href) => me.menu.some((m) => m.href === href);

zona.innerHTML = `
  <section class="tarjeta" aria-labelledby="t-bienvenida">
    <h2 id="t-bienvenida">¿Qué desea hacer hoy?</h2>
    <div class="acciones-grandes acciones-grandes--una">
      ${tiene('/volantes') ? `<a class="accion-grande" href="/volantes">${icono('recibo')} Mis volantes de pago</a>` : ''}
      <a class="accion-grande" href="/expediente">${icono('documento')} Ver mi expediente</a>
    </div>
    <p class="aviso aviso--info">${icono('info')}<span>Las solicitudes de permisos, vacaciones e incapacidades se habilitarán pronto.</span></p>
  </section>
  <section class="tarjeta" aria-labelledby="t-cuenta">
    <h2 id="t-cuenta">Mi cuenta</h2>
    <p><strong>Rol:</strong> ${escapar(textoRol(me.usuario.rol))}</p>
    <p><strong>Correo:</strong> ${escapar(me.usuario.correo ?? '')} <span class="pildora pildora--exito">${icono('ok')} Confirmado</span></p>
    <a class="btn btn--secundario" href="/cuenta">${icono('llave')} Cambiar contraseña o correo</a>
  </section>
  ${esAdmin ? `
  <section class="tarjeta" aria-labelledby="t-admin">
    <h2 id="t-admin">Administración</h2>
    <div class="acciones-grandes acciones-grandes--una">
      ${tiene('/nomina') ? `<a class="accion-grande" href="/nomina">${icono('subir')} Cargar y publicar nómina</a>` : ''}
      ${tiene('/colaboradores') ? `<a class="accion-grande" href="/colaboradores">${icono('usuarios')} Expedientes de colaboradores</a>` : ''}
      <a class="accion-grande" href="/usuarios">${icono('llave')} Gestionar usuarios</a>
    </div>
  </section>` : ''}`;

// Tarjetas de los módulos (cada una se monta por su cuenta; un fallo no afecta a las demás)
for (const script of [...(me.widgets ?? [])].reverse()) {
  try {
    const mod = await import(script);
    await mod.montar(zona, me);
  } catch {
    /* la tarjeta del módulo no se muestra */
  }
}
zona.removeAttribute('aria-busy');
