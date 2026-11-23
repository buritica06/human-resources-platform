# Guía del área contable (admincontable)

Usted administra la plataforma: usuarios, expedientes, nómina, la aprobación final de solicitudes, incapacidades, certificados, parámetros y reportes. Todo empieza en el **Panel**.

## 1. Puesta en marcha (una sola vez)
1. **Primer usuario admincontable** (lo hace quien instala): `npm run crear-admin -- <cédula> "<NOMBRE>"`.
2. **Colaboradores y usuarios:** en **Colaboradores** → importar desde la hoja **EMPLEADOS** del archivo de nómina. Se crean los expedientes; los usuarios se crean en **Usuarios**, uno por uno o con la carga masiva.
3. **Contraseñas temporales:** entréguelas en persona. Cada colaborador crea la suya y confirma su correo al ingresar.
4. **Saldo de vacaciones al corte:** en el expediente de cada colaborador → pestaña **Vacaciones** → "Registrar saldo al corte". Escriba cuántos días tenía pendientes **antes** de esa fecha y de dónde sale el dato. Sin este saldo, el colaborador no puede pedir vacaciones (el Panel avisa cuántos faltan).
5. **Parámetros:** revise los marcados **VERIFICAR** con su asesor laboral o contable (ver §6). Configure también quién firma los certificados (`CERT_FIRMANTE_NOMBRE`) y la ciudad (`CERT_CIUDAD`).

## 2. Nómina y volantes
1. En **Nómina**, suba el archivo de nómina y elija la hoja (por ejemplo, "NOMINA NOV 1-15").
2. Lea el **reporte de validación**:
   - cédulas que no existen;
   - quincena ya cargada;
   - devengado − deducciones ≠ neto;
   - filas que no se pueden asignar.
3. Si hay errores, corrija el archivo y vuelva a subirlo. La plataforma **no recalcula** la nómina: publica exactamente lo del archivo.
4. Revise la vista previa y pulse **Publicar**. Los colaboradores ven y descargan su volante. Si se equivocó, puede **anular** la quincena.

## 3. Aprobaciones (paso final)
En **Aprobaciones** están las solicitudes que esperan el paso contable. Al aprobar, quedan registradas en el expediente. Las vacaciones se descuentan del saldo.
- Usted aprueba sus propias solicitudes en el paso contable. Queda marcado como "Autoaprobación del área contable".
- Si el saldo de vacaciones cambió mientras la solicitud estaba en trámite y ya no alcanza, la plataforma no deja aprobar.
- **Anular una aprobada:** en el detalle de la solicitud, use **Anular aprobación** con motivo. Los días vuelven al saldo. Si ya se pagó en nómina, ajústelo allí.

## 4. Incapacidades
En **Incapacidades del equipo** (filtro "En revisión") abra cada una:
- Vea el certificado y el diagnóstico. Cada lectura queda auditada.
- Pulse **Validar**, o **Devolver** explicando qué corregir.
- Si hay vacaciones o licencias en esas fechas, la plataforma lo avisa, porque la incapacidad las interrumpe. Revíselo en la nómina.
- Puede registrar una incapacidad a nombre de un colaborador desde su expediente.

## 5. Expedientes, suspensiones y certificados
- **Editar expediente:** cada cambio guarda quién, cuándo, antes y después.
- **Suspensiones:** en la pestaña **Licencias** del expediente → "Registrar suspensión". Sus días no cuentan para causar vacaciones y no pueden cruzarse con otras ausencias. El colaborador recibe un aviso.
- **Certificados:** en la pestaña **Documentos** del expediente puede generar un certificado laboral a nombre del colaborador, también si está retirado. También puede **anular** uno emitido con error; la verificación pública mostrará que fue anulado.

## 6. Panel de administración
- **Parámetros:** cada cambio se **programa** con una fecha de inicio (hoy o futura) y un motivo (por ejemplo, el decreto).
  - El valor actual sigue rigiendo hasta esa fecha. Lo pasado no se modifica.
  - Puede borrar una versión programada antes de que rija.
  - Ejemplos: SMMLV y auxilio de transporte de cada año, y recargo dominical (Ley 2466).
- **Festivos:** cargue los del año siguiente antes de que empiece. Sin ellos no se pueden contar días hábiles de ese año.
- **Flujos:** defina quién aprueba cada tipo de solicitud: director y área contable, solo el área contable o solo el director.
- **Ausentismo:** elija las fechas y la sede.
  - Verá los totales y el detalle de permisos, vacaciones, licencias, incapacidades y suspensiones.
  - **Descargar CSV** lo abre en Excel.
  - No incluye diagnósticos.
- **Auditoría:** busque por cédula de quien actuó, tipo de registro, acción y fechas.

## 7. Buenas prácticas
- No comparta su usuario. Cada acción queda a su nombre.
- No guarde el archivo de nómina en lugares compartidos. La plataforma lo procesa en memoria y no lo conserva.
- Haga respaldos según `docs/despliegue.md`.
