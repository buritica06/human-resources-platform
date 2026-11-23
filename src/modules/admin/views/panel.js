// Panel del área contable: lo pendiente, la última nómina, alertas y accesos a la administración.
import { api } from '/static/js/api.js';
import { montarShell } from '/static/js/shell.js';
import { icono } from '/static/js/iconos.js';
import { escapar, fecha, htmlAviso } from '/static/js/ui.js';

await montarShell();
const zona = document.getElementById('zona');
const ICONO = { error: 'error', alerta: 'alerta', info: 'info' };
const ACCESOS = [
  ['/aprobaciones', 'ok', 'Aprobaciones', 'Solicitudes que esperan su aprobación'],
  ['/incapacidades/equipo', 'salud', 'Incapacidades', 'Revisar y validar'],
  ['/nomina', 'subir', 'Nómina', 'Cargar y publicar volantes'],
  ['/colaboradores', 'usuarios', 'Colaboradores', 'Expedientes, saldos, suspensiones'],
  ['/usuarios', 'usuario', 'Usuarios', 'Cuentas, roles y claves'],
  ['/admin/parametros', 'editar', 'Parámetros', 'Valores con fecha de vigencia'],
  ['/admin/festivos', 'calendario', 'Festivos', 'Calendario para días hábiles'],
  ['/admin/flujos', 'reloj', 'Flujos', 'Quién aprueba cada solicitud'],
  ['/admin/ausentismo', 'documento', 'Ausentismo', 'Reporte por sede y fechas (+CSV)'],
  ['/admin/auditoria', 'candado', 'Auditoría', 'Quién hizo qué y cuándo'],
];

try {
  const r = await api('/admin/resumen');
  const n = r.ultimaNomina;
  zona.innerHTML = `
    <div class="rejilla rejilla--3">
      <section class="tarjeta" aria-labelledby="p1"><h2 id="p1">Por aprobar</h2><p class="cifra-grande">${r.porAprobar}</p>
        <a class="btn ${r.porAprobar ? '' : 'btn--secundario'}" href="/aprobaciones">${icono('ok')} Ir a aprobaciones</a></section>
      <section class="tarjeta" aria-labelledby="p2"><h2 id="p2">Incapacidades por revisar</h2><p class="cifra-grande">${r.incapacidades}</p>
        <a class="btn ${r.incapacidades ? '' : 'btn--secundario'}" href="/incapacidades/equipo">${icono('salud')} Revisar</a></section>
      <section class="tarjeta" aria-labelledby="p3"><h2 id="p3">Última nómina</h2>
        ${
          n
            ? `<p><strong>${escapar(n.nombre_hoja)}</strong><br><span class="ayuda">Del ${escapar(fecha(n.fecha_inicio))} al ${escapar(fecha(n.fecha_fin))} · ${n.colaboradores} colaboradores · ${n.estado === 'PUBLICADO' ? 'publicada' : 'en borrador (sin publicar)'}</span></p>
          <a class="btn btn--secundario" href="/nomina/periodo?id=${n.id}">Ver</a>`
            : '<p class="ayuda">Aún no se ha cargado ninguna nómina.</p><a class="btn" href="/nomina">Cargar nómina</a>'
        }</section>
    </div>
    <section class="tarjeta" aria-labelledby="t-alertas"><h2 id="t-alertas">Alertas</h2>
      ${r.alertas.length ? `<ul class="lista-compacta">${r.alertas.map((a) => `<li>${icono(ICONO[a.nivel] ?? 'info')} ${escapar(a.texto)} <a href="${escapar(a.enlace)}">Ver</a></li>`).join('')}</ul>` : `<p class="ayuda">${icono('ok')} Todo en orden.</p>`}
    </section>
    <section class="tarjeta" aria-labelledby="t-accesos"><h2 id="t-accesos">Administración</h2>
      <div class="acciones-grandes">${ACCESOS.map(([h, ic, t, d]) => `<a class="accion-grande" href="${h}">${icono(ic)} <span>${escapar(t)}<br><span class="ayuda">${escapar(d)}</span></span></a>`).join('')}</div>
    </section>`;
} catch (err) {
  zona.innerHTML = htmlAviso('error', err.message);
} finally {
  zona.removeAttribute('aria-busy');
}
