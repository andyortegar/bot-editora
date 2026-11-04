// Datos del negocio y catálogo para la conversación.
import precios from '../precios.json' with { type: 'json' };
import feriados from '../feriados.json' with { type: 'json' };

export const NEGOCIO = {
  nombre: 'Editora Ortega',
  colaboradora: 'Verónica',
  colaboradoraCompleto: 'Verónica Romero',
  telefono: '+18297422974',
  direccion: 'C. La Negrita #43, Santo Domingo',
  ubicacion: { lat: 18.4800548, lng: -69.8838502 },
  ticketPromedio: 3000,
  maxProductos: 5,
  maxNoEntendido: 3,
  // Días después de los cuales un chat vuelve a empezar desde el saludo.
  diasReinicio: 7,
};

// Horario en hora de RD (UTC-4). 0 = domingo.
export const HORARIO = {
  1: [9 * 60, 17 * 60 + 30],
  2: [9 * 60, 17 * 60 + 30],
  3: [9 * 60, 17 * 60 + 30],
  4: [9 * 60, 17 * 60 + 30],
  5: [9 * 60, 17 * 60 + 30],
  6: [9 * 60, 12 * 60],
};
export const TEXTO_HORARIO =
  'de lunes a viernes de 9:00 a. m. a 5:30 p. m. y los sábados de 9:00 a. m. a 12:00 m.';

export const FERIADOS = Object.assign(
  {},
  ...Object.entries(feriados)
    .filter(([k]) => /^\d{4}$/.test(k))
    .map(([, v]) => v),
);

export const PRECIOS = precios;

// Cómo se muestra cada producto en la conversación.
// lista: título en la lista de WhatsApp (máx. 24 caracteres).
// unidad: cómo se nombra en plural; pasos: preguntas de variante.
export const CATALOGO = [
  {
    id: 'tarjetas', lista: 'Tarjetas de presentación', unidad: 'tarjetas',
    info: 'Tarjetas de presentación en cartonite u opalina, impresas de uno o ambos lados. Pedido mínimo: 250 tarjetas.',
    palabras: ['tarjeta', 'tarjetas', 'business card', 'presentacion'],
    pasos: [{
      campo: 'variante', pregunta: '¿Las desea con laminado?',
      opciones: [{ id: 'sin_laminado', boton: 'Sin laminado', texto: 'sin laminado' }, { id: 'laminado', boton: 'Con laminado', texto: 'con laminado' }],
    }],
  },
  {
    id: 'volantes', lista: 'Volantes', unidad: 'volantes',
    info: 'Volantes tamaño 5.5 x 8.5 pulgadas en papel satinado. Se trabajan por paquetes de 100, 300, 1,000 y 4,000.',
    palabras: ['volante', 'volantes', 'flyer', 'flyers', 'hoja suelta', 'hojas sueltas'],
    pasos: [{
      campo: 'variante', pregunta: '¿Impresos de un lado o de ambos lados?',
      opciones: [{ id: '1lado', boton: 'Un lado', texto: 'de un lado' }, { id: '2lados', boton: 'Ambos lados', texto: 'de ambos lados' }],
    }],
  },
  {
    id: 'brochure', lista: 'Brochure', unidad: 'brochures',
    info: 'Brochure tamaño 8.5 x 11 pulgadas en papel satinado o cartonite, en díptico o tríptico. Paquete de 100.',
    palabras: ['brochure', 'brochures', 'brochur', 'brochurs', 'triptico', 'tripticos', 'diptico', 'dipticos', 'folleto', 'folletos'],
    pasos: [
      {
        campo: 'variante', pregunta: '¿Los desea con laminado?',
        opciones: [{ id: 'sin_laminado', boton: 'Sin laminado', texto: 'sin laminado' }, { id: 'laminado', boton: 'Con laminado', texto: 'con laminado' }],
      },
      {
        campo: 'doblez', pregunta: '¿Díptico o tríptico?',
        opciones: [{ id: 'diptico', boton: 'Díptico', texto: 'díptico' }, { id: 'triptico', boton: 'Tríptico', texto: 'tríptico' }],
      },
    ],
  },
  {
    id: 'stickers', lista: 'Stickers', unidad: 'stickers',
    info: 'Stickers personalizados en tamaño 2 x 2 o 3 x 3 pulgadas. Pedido mínimo: 250.',
    palabras: ['sticker', 'stickers', 'pegatina', 'pegatinas', 'calcomania', 'calcomanias', 'etiqueta', 'etiquetas'],
    pasos: [{
      campo: 'variante', pregunta: '¿De qué tamaño?',
      opciones: [{ id: '2x2', boton: '2 x 2 pulgadas', texto: '2 x 2"' }, { id: '3x3', boton: '3 x 3 pulgadas', texto: '3 x 3"' }],
    }],
  },
  {
    id: 'tags', lista: 'Tags', unidad: 'tags',
    info: 'Tags personalizados tamaño 2 x 3 pulgadas. Pedido mínimo: 100.',
    palabras: ['tag', 'tags', 'hang tag', 'hangtag', 'etiqueta colgante', 'etiquetas colgantes'],
    pasos: [], varianteUnica: '2x3', texto: '2 x 3"',
  },
  {
    id: 'talonarios', lista: 'Talonarios', unidad: 'talonarios',
    palabras: ['talonario', 'talonarios', 'facturero', 'factureros', 'recibo', 'recibos', 'conduce', 'conduces', 'libreta de factura'],
    pasos: [{
      campo: 'variante', pregunta: null, // se informa con el mensaje especial de talonarios
      opciones: [{ id: '1color', boton: 'Un color', texto: 'a un color' }, { id: 'fullcolor', boton: 'Full color', texto: 'full color' }],
    }],
    cantidadFija: 18,
  },
  {
    id: 'bolsas', lista: 'Bolsas personalizadas', unidad: 'bolsas',
    info: 'Bolsas personalizadas en tres tamaños (ancho x fondo x alto, en pulgadas): 12 x 4 x 8, 5 x 3 x 7.25 y 4.25 x 2.5 x 5.5. Pedido mínimo: 50.',
    palabras: ['bolsa', 'bolsas', 'funda', 'fundas'],
    pasos: [{
      campo: 'variante', pregunta: '¿De qué tamaño?',
      opciones: [{ id: '12x4x8', boton: '12 x 4 x 8', texto: '12 x 4 x 8' }, { id: '5x3x7.25', boton: '5 x 3 x 7.25', texto: '5 x 3 x 7.25' }, { id: '4.25x2.5x5.5', boton: '4.25 x 2.5 x 5.5', texto: '4.25 x 2.5 x 5.5' }],
    }],
  },
  {
    id: 'banner_arana', lista: 'Banner araña', unidad: 'banners araña',
    info: 'Banner araña en dos tamaños: 2 x 5 pies o 3 x 6 pies.',
    palabras: ['banner arana', 'banners arana', 'arana', 'x banner', 'xbanner'],
    pasos: [{
      campo: 'variante', pregunta: '¿De qué tamaño?',
      opciones: [{ id: '2x5', boton: '2 x 5 pies', texto: '2 x 5 pies' }, { id: '3x6', boton: '3 x 6 pies', texto: '3 x 6 pies' }],
    }],
  },
  {
    id: 'roll_up', lista: 'Roll Up', unidad: 'roll up',
    info: 'Roll Up Banner de 31 x 80 pulgadas.',
    palabras: ['roll up', 'rollup', 'roll-up', 'rollups', 'roll ups', 'banner retractil'],
    pasos: [], varianteUnica: '31x80', texto: '31 x 80"',
  },
];

export const OTRO_PRODUCTO = { id: 'otro_producto', lista: 'Otro producto' };

// Ofertas activas (las maneja el panel; vacío hasta que marketing las entregue).
export const OFERTAS = [];
