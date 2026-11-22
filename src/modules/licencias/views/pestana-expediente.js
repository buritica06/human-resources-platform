// Pestaña "Licencias" del expediente: solicitudes de licencia y, debajo, las suspensiones (las ven
// solo el propio colaborador y el área contable; para el director el servidor responde 404).
import { montar as montarSolicitudes } from '/m/solicitudes/pestana-expediente.js';

export async function montar(panel, opciones) {
  panel.innerHTML = '<h3 class="subtitulo">Licencias</h3><div id="lic-sol"></div><div id="lic-sus"></div>';
  await montarSolicitudes(panel.querySelector('#lic-sol'), opciones);
  if (opciones.rol === 'DIRECTOR' && !opciones.propio) return;
  try {
    const { montar: montarSuspensiones } = await import('/m/admin/pestana-suspensiones.js');
    await montarSuspensiones(panel.querySelector('#lic-sus'), opciones);
  } catch {
    // módulo del panel desactivado: no hay suspensiones que mostrar
  }
}