// Catálogo de campos del expediente: una sola definición para validar, decidir quién
// ve y edita cada dato, registrar el historial y pintar la interfaz.
//
// tipo: texto | fecha | dinero | sino | lista | celular | telefono | sede | empleador
// lista: clave del parámetro con los valores permitidos (p. ej. LISTA_EPS)
// director: false → el director administrativo no lo ve (datos de pago)
// sensible: se guarda cifrado y se muestra enmascarado
// max: largo máximo (igual al de la columna en la BD; PostgreSQL lo exige)

export const GRUPOS = [
  ['personales', 'Datos personales'],
  ['contacto', 'Contacto'],
  ['laborales', 'Datos laborales'],
  ['seguridad', 'Seguridad social'],
  ['pago', 'Pago de nómina'],
  ['jornada', 'Jornada'],
  ['retiro', 'Estado y retiro'],
];

export const CAMPOS = [
  {
    clave: 'nombre',
    etiqueta: 'Nombre completo (apellidos y nombres)',
    grupo: 'personales',
    tipo: 'texto',
    max: 150,
    obligatorio: true,
    mayusculas: true,
  },
  { clave: 'cedula', etiqueta: 'Cédula', grupo: 'personales', tipo: 'texto', soloLectura: true },
  { clave: 'fecha_nacimiento', etiqueta: 'Fecha de nacimiento', grupo: 'personales', tipo: 'fecha' },
  { clave: 'sexo', etiqueta: 'Sexo', grupo: 'personales', tipo: 'lista', lista: 'LISTA_SEXO', max: 20 },
  { clave: 'estado_civil', etiqueta: 'Estado civil', grupo: 'personales', tipo: 'lista', lista: 'LISTA_ESTADO_CIVIL', max: 20 },
  { clave: 'nacionalidad', etiqueta: 'Nacionalidad', grupo: 'personales', tipo: 'texto', max: 40 },
  { clave: 'ciudad_nacimiento', etiqueta: 'Ciudad de nacimiento', grupo: 'personales', tipo: 'texto', max: 80 },

  { clave: 'celular', etiqueta: 'Celular', grupo: 'contacto', tipo: 'celular' },
  { clave: 'ciudad_residencia', etiqueta: 'Ciudad de residencia', grupo: 'contacto', tipo: 'texto', max: 80 },
  { clave: 'direccion', etiqueta: 'Dirección', grupo: 'contacto', tipo: 'texto', max: 120 },
  { clave: 'barrio', etiqueta: 'Barrio', grupo: 'contacto', tipo: 'texto', max: 80 },
  { clave: 'contacto_emergencia_nombre', etiqueta: 'Contacto de emergencia', grupo: 'contacto', tipo: 'texto', max: 100 },
  { clave: 'contacto_emergencia_telefono', etiqueta: 'Teléfono de emergencia', grupo: 'contacto', tipo: 'telefono' },

  { clave: 'empleador_id', etiqueta: 'Empleador', grupo: 'laborales', tipo: 'empleador', obligatorio: true },
  { clave: 'sede_id', etiqueta: 'Sede (área)', grupo: 'laborales', tipo: 'sede', obligatorio: true },
  { clave: 'cargo', etiqueta: 'Cargo', grupo: 'laborales', tipo: 'texto', max: 80, mayusculas: true },
  { clave: 'rango', etiqueta: 'Rango o nivel salarial', grupo: 'laborales', tipo: 'texto', max: 40 },
  { clave: 'tipo_contrato', etiqueta: 'Tipo de contrato', grupo: 'laborales', tipo: 'lista', lista: 'LISTA_CONTRATOS', max: 40 },
  { clave: 'fecha_ingreso', etiqueta: 'Fecha de ingreso', grupo: 'laborales', tipo: 'fecha' },
  { clave: 'fecha_fin_contrato', etiqueta: 'Fecha fin del contrato (fijo u obra)', grupo: 'laborales', tipo: 'fecha' },
  { clave: 'salario_base', etiqueta: 'Salario base mensual', grupo: 'laborales', tipo: 'dinero' },
  { clave: 'aux_transporte', etiqueta: 'Auxilio de transporte', grupo: 'laborales', tipo: 'sino' },

  { clave: 'eps', etiqueta: 'EPS', grupo: 'seguridad', tipo: 'lista', lista: 'LISTA_EPS', max: 60 },
  { clave: 'afp', etiqueta: 'Fondo de pensión (AFP)', grupo: 'seguridad', tipo: 'lista', lista: 'LISTA_AFP', max: 60 },
  { clave: 'fondo_cesantias', etiqueta: 'Fondo de cesantías', grupo: 'seguridad', tipo: 'texto', max: 60 },
  { clave: 'caja', etiqueta: 'Caja de compensación', grupo: 'seguridad', tipo: 'texto', max: 60 },
  { clave: 'arl_riesgo', etiqueta: 'Clase de riesgo ARL', grupo: 'seguridad', tipo: 'lista', lista: 'LISTA_ARL', max: 5 },

  { clave: 'banco', etiqueta: 'Banco', grupo: 'pago', tipo: 'lista', lista: 'LISTA_BANCOS', max: 60, director: false },
  { clave: 'tipo_cuenta', etiqueta: 'Tipo de cuenta', grupo: 'pago', tipo: 'lista', lista: 'LISTA_TIPO_CUENTA', max: 20, director: false },
  {
    clave: 'numero_cuenta',
    etiqueta: 'Número de cuenta',
    grupo: 'pago',
    tipo: 'texto',
    max: 20,
    patron: /^\d{4,20}$/,
    mensajePatron: 'Solo números (4 a 20 dígitos).',
    sensible: true,
    director: false,
  },

  { clave: 'dia_descanso', etiqueta: 'Día de descanso pactado', grupo: 'jornada', tipo: 'lista', lista: 'LISTA_DIAS', max: 12 },
  { clave: 'esquema_horas', etiqueta: 'Esquema de horas', grupo: 'jornada', tipo: 'lista', lista: 'LISTA_ESQUEMAS', max: 20 },
  { clave: 'lactancia', etiqueta: 'Lactancia (½ hora diaria)', grupo: 'jornada', tipo: 'sino' },
  { clave: 'fin_lactancia', etiqueta: 'Fin de la lactancia', grupo: 'jornada', tipo: 'fecha' },

  { clave: 'estado', etiqueta: 'Estado', grupo: 'retiro', tipo: 'lista', lista: '_ESTADO', obligatorio: true },
  { clave: 'fecha_retiro', etiqueta: 'Fecha de retiro', grupo: 'retiro', tipo: 'fecha' },
  { clave: 'motivo_retiro', etiqueta: 'Motivo de retiro', grupo: 'retiro', tipo: 'lista', lista: 'LISTA_MOTIVOS_RETIRO', max: 60 },
];

export const POR_CLAVE = Object.fromEntries(CAMPOS.map((c) => [c.clave, c]));
export const ESTADOS = ['ACTIVO', 'RETIRADO'];
