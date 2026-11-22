// Datos iniciales del sistema (NO personales): parámetros tomados del archivo base de
// nómina 2026 (hoja PARAMETROS) y festivos de Colombia 2026–2027 (PARAMETROS!S6:S55).
// Ver docs/analisis.md §3.7 y §3.8.

export const PARAMETROS = [
  // clave, valor, tipo, vigente_desde, vigente_hasta, descripcion
  ['SMMLV', 1750905, 'numero', '2026-01-01', '2026-12-31', 'Salario mínimo mensual legal vigente 2026'],
  ['AUX_TRANSP', 249095, 'numero', '2026-01-01', '2026-12-31', 'Auxilio de transporte mensual 2026'],
  ['JORNADA_SEMANA', 42, 'numero', '2026-07-15', null, 'Horas semanales máximas (Ley 2101 de 2021)'],
  ['JORNADA_DIA', 7, 'numero', '2026-07-15', null, 'Horas por día de la jornada'],
  ['HORAS_MES', 210, 'numero', '2026-07-15', null, 'Horas mensuales para el valor hora'],
  ['MODO_EXTRAS', 'SEMANAL', 'texto', '2026-01-01', null, 'Extras: lo que pase de la jornada semanal (lunes a domingo)'],
  ['HORA_NOCHE_INI', 19, 'numero', '2025-12-25', null, 'Inicio de la franja nocturna (Ley 2466 de 2025)'],
  ['HORA_NOCHE_FIN', 6, 'numero', '2025-12-25', null, 'Fin de la franja nocturna'],
  ['F_RN', 0.35, 'numero', '2026-01-01', null, 'Recargo nocturno'],
  ['F_DOM', 0.9, 'numero', '2026-07-01', '2027-06-30', 'Recargo dominical/festivo (Ley 2466 de 2025, tramo jul-2026)'],
  ['F_DOM', 1.0, 'numero', '2027-07-01', null, 'Recargo dominical/festivo (Ley 2466 de 2025, tramo jul-2027) – VERIFICAR'],
  ['F_HED', 1.25, 'numero', '2026-01-01', null, 'Factor hora extra diurna'],
  ['F_HEN', 1.75, 'numero', '2026-01-01', null, 'Factor hora extra nocturna'],
  ['F_HEDDF', 2.15, 'numero', '2026-07-01', '2027-06-30', 'Factor hora extra diurna dominical/festiva'],
  ['F_HENDF', 2.65, 'numero', '2026-07-01', '2027-06-30', 'Factor hora extra nocturna dominical/festiva'],
  ['F_HEDDF', 2.25, 'numero', '2027-07-01', null, 'Factor hora extra diurna dominical/festiva (1,25 + 1,00) – VERIFICAR'],
  ['F_HENDF', 2.75, 'numero', '2027-07-01', null, 'Factor hora extra nocturna dominical/festiva (1,75 + 1,00) – VERIFICAR'],
  ['INC_EG_PCT', 0.6667, 'numero', '2026-01-01', null, 'Porcentaje de pago de la incapacidad general'],
  ['SABADO_HABIL', true, 'booleano', '2026-01-01', null, 'El sábado cuenta como día hábil para vacaciones'],
  ['VAC_DIAS_HABILES_ANIO', 15, 'numero', '2026-01-01', null, 'Días hábiles de vacaciones por año de servicio (CST art. 186)'],
  ['VAC_COMPENSACION_MAX_PCT', 50, 'numero', '2026-01-01', null, 'Máximo % de vacaciones compensables en dinero (CST art. 189) – VERIFICAR'],
  ['SESION_INACTIVIDAD_MIN', 15, 'numero', '2026-01-01', null, 'Minutos de inactividad antes de cerrar la sesión'],
  ['LOGIN_MAX_INTENTOS', 5, 'numero', '2026-01-01', null, 'Intentos fallidos antes de bloquear la cuenta'],
  ['LOGIN_BLOQUEO_MIN', 15, 'numero', '2026-01-01', null, 'Minutos de bloqueo tras superar los intentos'],
  ['UPLOAD_MAX_MB', 5, 'numero', '2026-01-01', null, 'Tamaño máximo de los PDF subidos'],

  // M1 – Expediente. Listas de valores tomadas de PARAMETROS del archivo base (columnas V–AG).
  ['LISTA_CONTRATOS', ['INDEFINIDO', 'FIJO 1 AÑO', 'FIJO INFERIOR A 1 AÑO', 'OBRA O LABOR', 'APRENDIZAJE'], 'json', '2026-01-01', null, 'Tipos de contrato'],
  ['LISTA_EPS', ['Salud total', 'Nueva eps', 'Sura', 'Mutualser', 'Cajacopi', 'Sanitas', 'Coosalud', 'Famisanar', 'Compensar'], 'json', '2026-01-01', null, 'EPS'],
  ['LISTA_AFP', ['Colpensiones', 'Porvenir', 'Proteccion', 'Colfondos', 'Skandia'], 'json', '2026-01-01', null, 'Fondos de pensión'],
  ['LISTA_BANCOS', ['BANCOLOMBIA', 'DAVIVIENDA', 'BANCO DE BOGOTA', 'BBVA', 'NEQUI', 'DAVIPLATA', 'BANCO AGRARIO', 'CAJA SOCIAL'], 'json', '2026-01-01', null, 'Bancos'],
  ['LISTA_TIPO_CUENTA', ['AHORRO', 'CORRIENTE'], 'json', '2026-01-01', null, 'Tipos de cuenta'],
  ['LISTA_ARL', ['I', 'II', 'III', 'IV', 'V'], 'json', '2026-01-01', null, 'Clases de riesgo ARL'],
  ['LISTA_MOTIVOS_RETIRO', ['RENUNCIA VOLUNTARIA', 'EXPIRACION DE PLAZO FIJO PACTADO', 'TERMINACION POR JUSTA CAUSA', 'DESPIDO SIN JUSTA CAUSA', 'MUTUO ACUERDO', 'TERMINACION DE OBRA O LABOR', 'TERMINACION EN PERIODO DE PRUEBA'], 'json', '2026-01-01', null, 'Motivos de retiro'],
  ['LISTA_DIAS', ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'], 'json', '2026-01-01', null, 'Días de la semana (día de descanso pactado)'],
  ['LISTA_ESQUEMAS', ['SEMANA COMPLETA', 'PRORRATEO'], 'json', '2026-01-01', null, 'Esquemas de liquidación de horas'],
  ['LISTA_ESTADO_CIVIL', ['SOLTERO(A)', 'CASADO(A)', 'UNIÓN LIBRE', 'SEPARADO(A)', 'DIVORCIADO(A)', 'VIUDO(A)'], 'json', '2026-01-01', null, 'Estado civil'],
  ['LISTA_SEXO', ['HOMBRE', 'MUJER'], 'json', '2026-01-01', null, 'Sexo (como en el registro civil)'],
  // M3 – Permisos (supuesto P13: tipos parametrizables)
  ['LISTA_TIPOS_PERMISO', ['CITA MÉDICA', 'DILIGENCIA PERSONAL', 'ESTUDIO', 'ASUNTO FAMILIAR', 'OTRO'], 'json', '2026-01-01', null, 'Tipos de permiso que puede pedir el colaborador'],
  ['INC_MAX_DIAS', 180, 'numero', '2026-01-01', null, 'Máximo de días calendario de un certificado de incapacidad (control de digitación) – VERIFICAR'],
  ['INC_REGISTRO_MAX_DIAS_ATRAS', 60, 'numero', '2026-01-01', null, 'Hasta cuántos días después de su inicio se puede registrar una incapacidad – VERIFICAR'],
  ['LISTA_TIPOS_PERMISO_SENSIBLES', ['CITA MÉDICA'], 'json', '2026-01-01', null, 'Tipos de permiso cuyo soporte es dato de salud (Ley 1581): el director no lo ve'],
  ['PERMISO_MAX_DIAS', 3, 'numero', '2026-01-01', null, 'Duración máxima de un permiso (días calendario); para más, vacaciones o licencia'],
  // Campos que el colaborador puede editar de su propio expediente (supuesto P11)
  ['CAMPOS_EDITABLES_COLABORADOR', ['celular', 'direccion', 'barrio', 'ciudad_residencia', 'estado_civil', 'contacto_emergencia_nombre', 'contacto_emergencia_telefono'], 'json', '2026-01-01', null, 'Datos del expediente que el colaborador puede actualizar por sí mismo'],
];

export const FESTIVOS = [
  ['2026-01-01', 'Año Nuevo'], ['2026-01-12', 'Reyes Magos'], ['2026-03-23', 'San José'],
  ['2026-04-02', 'Jueves Santo'], ['2026-04-03', 'Viernes Santo'], ['2026-05-01', 'Día del Trabajo'],
  ['2026-05-18', 'Ascensión del Señor'], ['2026-06-08', 'Corpus Christi'], ['2026-06-15', 'Sagrado Corazón'],
  ['2026-06-29', 'San Pedro y San Pablo'], ['2026-07-20', 'Independencia'], ['2026-08-07', 'Batalla de Boyacá'],
  ['2026-08-17', 'Asunción de la Virgen'], ['2026-10-12', 'Día de la Raza'], ['2026-11-02', 'Todos los Santos'],
  ['2026-11-16', 'Independencia de Cartagena'], ['2026-12-08', 'Inmaculada Concepción'], ['2026-12-25', 'Navidad'],
  ['2027-01-01', 'Año Nuevo'], ['2027-01-11', 'Reyes Magos'], ['2027-03-22', 'San José'],
  ['2027-03-25', 'Jueves Santo'], ['2027-03-26', 'Viernes Santo'], ['2027-05-01', 'Día del Trabajo'],
  ['2027-05-10', 'Ascensión del Señor'], ['2027-05-31', 'Corpus Christi'], ['2027-06-07', 'Sagrado Corazón'],
  ['2027-07-05', 'San Pedro y San Pablo'], ['2027-07-20', 'Independencia'], ['2027-08-07', 'Batalla de Boyacá'],
  ['2027-08-16', 'Asunción de la Virgen'], ['2027-10-18', 'Día de la Raza'], ['2027-11-01', 'Todos los Santos'],
  ['2027-11-15', 'Independencia de Cartagena'], ['2027-12-08', 'Inmaculada Concepción'], ['2027-12-25', 'Navidad'],
];

// Flujo de aprobación por defecto (supuesto S1): director → admincontable. Se puede cambiar
// por configuración (tabla flujos) sin tocar código.
export const FLUJO_POR_DEFECTO = [
  { rol: 'DIRECTOR', estado: 'PENDIENTE_DIRECTOR', etiqueta: 'Pendiente director' },
  { rol: 'ADMIN', estado: 'PENDIENTE_CONTABLE', etiqueta: 'Pendiente contable' },
];
export const TIPOS_CON_FLUJO = ['PERMISO', 'VACACIONES', 'LICENCIA'];

// Organización FICTICIA para desarrollo (misma forma que la real: 3 empleadores, 9 sedes).
export const EMPLEADORES_FICTICIOS = [
  { clave: 'EMP_A', razon_social: 'EMPLEADOR DEMO A', documento: '900000001' },
  { clave: 'EMP_B', razon_social: 'EMPLEADOR DEMO B', documento: '900000002' },
  { clave: 'EMP_C', razon_social: 'EMPLEADOR DEMO C', documento: '900000003' },
];
export const SEDES_FICTICIAS = [
  ['EMP_A', 'SEDE NORTE'], ['EMP_A', 'SEDE SUR'], ['EMP_A', 'SEDE CENTRO'], ['EMP_A', 'SEDE PLAZA'],
  ['EMP_B', 'SEDE RIO'], ['EMP_B', 'SEDE PUERTO'], ['EMP_B', 'SEDE PALMAS'], ['EMP_B', 'SEDE LOMA'],
  ['EMP_C', 'SEDE CAMPO'],
];
