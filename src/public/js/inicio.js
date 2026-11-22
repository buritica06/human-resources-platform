// Inicio. Cada módulo aportará sus tarjetas (último volante, saldo de vacaciones,
// solicitudes en curso y botones grandes) a medida que se construya (M1–M8).
import { montarShell, textoRol } from './shell.js';
import { icono } from './iconos.js';
import { escapar } from './ui.js';

const me = await montarShell();
const zona = document.getElementById('widgets');
const esAdmin = me.usuario.rol === 'ADMIN';

zona.innerHTML = `
  <section class="tarjeta" aria-labelledby="t-bienvenida">
    <h2 id="t-bienvenida">Bienvenido a Talento Humano</h2>
    <p>Desde aquí podrá consultar sus volantes de pago, pedir permisos y vacaciones, subir incapacidades y descargar certificados.</p>
    <div class="acciones-grandes acciones-grandes--una">
      <a class="accion-grande" href="/expediente">${icono('documento')} Ver mi expediente</a>
    </div>
    <p class="aviso aviso--info">${icono('info')}<span>Las demás opciones se irán habilitando a medida que el área contable las active.</span></p>
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
      <a class="accion-grande" href="/usuarios">${icono('usuarios')} Gestionar usuarios</a>
    </div>
  </section>` : ''}`;
zona.removeAttribute('aria-busy');
