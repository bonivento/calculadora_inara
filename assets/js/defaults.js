/* Datos de ejemplo y valores por defecto — Calculadora Inara by Alma (agente C).
   Precios aproximados en COP (Colombia); la usuaria debe ajustarlos a sus proveedores reales. */
(function () {
  'use strict';
  window.CI = window.CI || {};

  var CATEGORIAS = [
    { id: 'cera',      label: 'Ceras',            icon: 'candle',          unidad: 'g' },
    { id: 'fragancia', label: 'Fragancias',       icon: 'water_drop',      unidad: 'g' },
    { id: 'colorante', label: 'Colorantes',       icon: 'palette',         unidad: 'g' },
    { id: 'mecha',     label: 'Mechas',           icon: 'linear_scale',    unidad: 'un' },
    { id: 'envase',    label: 'Envases',          icon: 'local_drink',     unidad: 'un' },
    { id: 'molde',     label: 'Moldes',           icon: 'grid_view',       unidad: 'un' },
    { id: 'empaque',   label: 'Empaque y etiquetas', icon: 'inventory_2',  unidad: 'un' },
    { id: 'aceite',    label: 'Aceites y mantecas', icon: 'oil_barrel',    unidad: 'g' },
    { id: 'soda',      label: 'Soda cáustica',    icon: 'science',         unidad: 'g' },
    { id: 'aditivo',   label: 'Aditivos (arcillas, avena...)', icon: 'spa', unidad: 'g' },
    { id: 'base',      label: 'Bases (glicerina)', icon: 'bubble_chart',   unidad: 'g' },
    { id: 'otro',      label: 'Otros',            icon: 'category',        unidad: 'un' }
  ];

  var SETTINGS = {
    nombreNegocio: 'Inara by Alma',
    manoObraHora: 12000,
    energiaHora: 2500,
    indirectosPct: 10,
    mermaPct: 3,
    metodoPrecio: 'margen',
    margenDetalPct: 50,
    margenMayoristaPct: 30,
    redondeoA: 500,
    comisionPct: 3.4,
    comisionFija: 900,
    aplicarComision: false,
    ivaPct: 19,
    aplicarIva: false,
    moneda: 'COP'
  };

  // Helper compacto para declarar insumos de ejemplo
  function I(id, categoria, nombre, unidad, precioCompra, cantidadCompra, proveedor, extra) {
    var o = { id: id, categoria: categoria, nombre: nombre, unidad: unidad,
      precioCompra: precioCompra, cantidadCompra: cantidadCompra, proveedor: proveedor || '', notas: '' };
    if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) o[k] = extra[k];
    return o;
  }

  var INSUMOS = [
    // Ceras
    I('cera-soya', 'cera', 'Cera de soya para contenedor (GW 464)', 'g', 38000, 1000, 'Proveedor de velas', { densidad: 0.9 }),
    I('cera-coco-soya', 'cera', 'Cera de coco y soya', 'g', 46000, 1000, 'Proveedor de velas', { densidad: 0.9 }),
    I('parafina', 'cera', 'Parafina semirrefinada', 'g', 14000, 1000, 'Proveedor de velas', { densidad: 0.88 }),
    I('cera-abejas', 'cera', 'Cera de abejas', 'g', 42000, 500, 'Apicultor local', { densidad: 0.96 }),
    // Fragancias
    I('fr-vainilla', 'fragancia', 'Esencia vainilla', 'g', 18000, 100, 'Proveedor de esencias'),
    I('fr-lavanda', 'fragancia', 'Esencia lavanda', 'g', 20000, 100, 'Proveedor de esencias'),
    I('fr-coco', 'fragancia', 'Esencia coco', 'g', 19000, 100, 'Proveedor de esencias'),
    I('fr-cafe', 'fragancia', 'Esencia café', 'g', 22000, 100, 'Proveedor de esencias'),
    I('fr-avena-miel', 'fragancia', 'Fragancia cosmética avena y miel', 'g', 24000, 100, 'Proveedor de esencias'),
    // Colorantes
    I('col-ocre', 'colorante', 'Colorante en chips ocre', 'g', 9000, 50, 'Proveedor de velas'),
    I('col-verde-oliva', 'colorante', 'Colorante en chips verde oliva', 'g', 9000, 50, 'Proveedor de velas'),
    I('col-mica-dorada', 'colorante', 'Mica dorada (cosmética)', 'g', 12000, 25, 'Proveedor de jabones'),
    // Mechas
    I('mecha-algodon-n2', 'mecha', 'Mecha de algodón N.° 2 con base', 'un', 15000, 100, 'Proveedor de velas'),
    I('mecha-algodon-n3', 'mecha', 'Mecha de algodón N.° 3 con base', 'un', 16000, 100, 'Proveedor de velas'),
    I('mecha-madera', 'mecha', 'Mecha de madera', 'un', 45000, 50, 'Proveedor de velas'),
    // Envases (un solo uso, usos 1)
    I('vaso-vidrio-8oz', 'envase', 'Vaso de vidrio 8 oz', 'un', 33600, 12, 'Distribuidora de vidrio', { capacidadMl: 240, usos: 1 }),
    I('frasco-ambar-200ml', 'envase', 'Frasco ámbar 200 ml con tapa', 'un', 43200, 12, 'Distribuidora de vidrio', { capacidadMl: 200, usos: 1 }),
    I('lata-4oz', 'envase', 'Lata de aluminio 4 oz con tapa', 'un', 36000, 24, 'Distribuidora de latas', { capacidadMl: 120, usos: 1 }),
    I('vaso-vidrio-10oz', 'envase', 'Vaso de vidrio 10 oz con tapa de bambú', 'un', 54000, 12, 'Distribuidora de vidrio', { capacidadMl: 300, usos: 1 }),
    // Moldes
    I('molde-silicona-pilar', 'molde', 'Molde de silicona pilar', 'un', 18000, 1, 'Tienda de moldes', { capacidadG: 180, usos: 100 }),
    I('molde-acrilico-corazon', 'molde', 'Molde de acrílico corazón', 'un', 22000, 1, 'Tienda de moldes', { capacidadG: 90, usos: 150 }),
    I('molde-jabon-loaf', 'molde', 'Molde de silicona para jabón (loaf 1 kg)', 'un', 35000, 1, 'Tienda de moldes', { capacidadG: 1300, usos: 200 }),
    I('molde-jabon-glicerina-6', 'molde', 'Molde de silicona 6 cavidades (glicerina)', 'un', 16000, 1, 'Tienda de moldes', { capacidadG: 540, usos: 200 }),
    // Aceites y mantecas (sapNaoh: g de NaOH por g de aceite)
    I('aceite-coco', 'aceite', 'Aceite de coco', 'g', 14000, 1000, 'Proveedor de jabones', { sapNaoh: 0.183 }),
    I('aceite-oliva', 'aceite', 'Aceite de oliva', 'g', 32000, 1000, 'Supermercado mayorista', { sapNaoh: 0.134 }),
    I('aceite-palma', 'aceite', 'Aceite de palma', 'g', 12000, 1000, 'Proveedor de jabones', { sapNaoh: 0.141 }),
    I('aceite-ricino', 'aceite', 'Aceite de ricino', 'g', 16000, 500, 'Proveedor de jabones', { sapNaoh: 0.128 }),
    I('manteca-karite', 'aceite', 'Manteca de karité', 'g', 28000, 500, 'Proveedor de jabones', { sapNaoh: 0.128 }),
    I('manteca-cacao', 'aceite', 'Manteca de cacao', 'g', 30000, 500, 'Proveedor de jabones', { sapNaoh: 0.137 }),
    I('aceite-almendras', 'aceite', 'Aceite de almendras dulces', 'g', 38000, 500, 'Proveedor de jabones', { sapNaoh: 0.136 }),
    I('aceite-aguacate', 'aceite', 'Aceite de aguacate', 'g', 30000, 500, 'Proveedor de jabones', { sapNaoh: 0.133 }),
    // Soda
    I('soda-naoh', 'soda', 'Soda cáustica (hidróxido de sodio)', 'g', 15000, 1000, 'Ferretería / droguería química', { pureza: 98 }),
    // Aditivos
    I('arcilla-verde', 'aditivo', 'Arcilla verde', 'g', 12000, 500, 'Proveedor de jabones'),
    I('avena-molida', 'aditivo', 'Avena molida', 'g', 6000, 500, 'Tienda de granos'),
    I('carbon-activado', 'aditivo', 'Carbón activado', 'g', 20000, 250, 'Proveedor de jabones'),
    I('curcuma', 'aditivo', 'Cúrcuma en polvo', 'g', 10000, 250, 'Tienda de granos'),
    // Base
    I('base-glicerina', 'base', 'Base de glicerina transparente (melt & pour)', 'g', 28000, 1000, 'Proveedor de jabones'),
    // Empaque
    I('caja-vela', 'empaque', 'Caja de cartón para vela', 'un', 90000, 50, 'Imprenta'),
    I('bolsa-kraft', 'empaque', 'Bolsa kraft', 'un', 35000, 100, 'Papelería'),
    I('etiqueta-adhesiva', 'empaque', 'Etiqueta adhesiva impresa', 'un', 12000, 100, 'Imprenta'),
    I('cinta-yute', 'empaque', 'Cinta de yute (por vuelta de 1 m)', 'un', 9000, 50, 'Papelería'),
    I('faja-carton-jabon', 'empaque', 'Faja de cartón para jabón', 'un', 30000, 100, 'Imprenta'),
    I('papel-seda', 'empaque', 'Papel de seda', 'un', 15000, 100, 'Papelería')
  ];

  var ISO = '2026-01-01T00:00:00.000Z';

  function recetaBase(o) {
    var r = {
      id: '', tipo: 'vela', nombre: '', formato: '', notas: '',
      unidadesPorLote: 1, manoObraMin: 0, energiaMin: 0,
      extras: [], costosExtra: [],
      mermaPct: null, margenDetalPct: null, margenMayoristaPct: null, precioActual: null,
      creado: ISO, actualizado: ISO
    };
    for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) r[k] = o[k];
    return r;
  }

  var RECETAS = [
    recetaBase({
      id: 'ejemplo-vela-vaso-8oz', tipo: 'vela', nombre: 'Vela de soya vainilla (vaso 8 oz)', formato: 'Vaso 8oz',
      notas: 'Ejemplo: ajusta los datos a tu receta real.',
      unidadesPorLote: 6, manoObraMin: 60, energiaMin: 45,
      extras: [{ insumoId: 'caja-vela', cantidad: 1 }, { insumoId: 'etiqueta-adhesiva', cantidad: 1 }],
      precioActual: 35000,
      vela: {
        ceras: [{ insumoId: 'cera-soya', pct: 100 }],
        envaseId: 'vaso-vidrio-8oz', moldeId: null, llenadoPct: 90, pesoCeraG: null,
        fraganciaId: 'fr-vainilla', fraganciaPct: 8,
        colorantes: [], mechas: [{ insumoId: 'mecha-algodon-n2', cantidad: 1 }]
      }
    }),
    recetaBase({
      id: 'ejemplo-vela-pilar', tipo: 'vela', nombre: 'Vela pilar lavanda (molde de silicona)', formato: 'Molde pilar',
      notas: 'Ejemplo: mezcla de coco-soya con cera de abejas.',
      unidadesPorLote: 4, manoObraMin: 75, energiaMin: 50,
      extras: [{ insumoId: 'bolsa-kraft', cantidad: 1 }, { insumoId: 'cinta-yute', cantidad: 1 }],
      precioActual: 28000,
      vela: {
        ceras: [{ insumoId: 'cera-coco-soya', pct: 70 }, { insumoId: 'cera-abejas', pct: 30 }],
        envaseId: null, moldeId: 'molde-silicona-pilar', llenadoPct: 90, pesoCeraG: null,
        fraganciaId: 'fr-lavanda', fraganciaPct: 7,
        colorantes: [{ insumoId: 'col-verde-oliva', cantidad: 0.3 }],
        mechas: [{ insumoId: 'mecha-algodon-n3', cantidad: 1 }]
      }
    }),
    recetaBase({
      id: 'ejemplo-jabon-avena', tipo: 'jabon', nombre: 'Jabón artesanal de avena y miel (proceso en frío)', formato: 'Barra 100g',
      notas: 'Ejemplo: 1 kg de aceites, curado de 4 semanas.',
      unidadesPorLote: 10, manoObraMin: 90, energiaMin: 0,
      extras: [{ insumoId: 'faja-carton-jabon', cantidad: 1 }, { insumoId: 'etiqueta-adhesiva', cantidad: 1 }],
      precioActual: 12000,
      jabon: {
        metodo: 'frio',
        aceites: [
          { insumoId: 'aceite-oliva', g: 400 }, { insumoId: 'aceite-coco', g: 300 },
          { insumoId: 'aceite-palma', g: 200 }, { insumoId: 'aceite-ricino', g: 50 },
          { insumoId: 'manteca-karite', g: 50 }
        ],
        bases: [], superGrasaPct: 5, aguaPct: 33, sodaId: 'soda-naoh',
        fraganciaId: 'fr-avena-miel', fraganciaPct: 3,
        aditivos: [{ insumoId: 'avena-molida', g: 30 }],
        moldeId: 'molde-jabon-loaf', moldeUsos: null,
        mermaCuradoPct: 15, semanasCurado: 4
      }
    })
  ];

  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  window.CI.defaults = {
    CATEGORIAS: CATEGORIAS,
    SETTINGS: SETTINGS,
    // Copias frescas (seguras de mutar)
    settings: function () { return clone(SETTINGS); },
    insumos: function () { return clone(INSUMOS); },
    recetas: function () { return clone(RECETAS); },
    categoria: function (id) {
      for (var i = 0; i < CATEGORIAS.length; i++) if (CATEGORIAS[i].id === id) return CATEGORIAS[i];
      return CATEGORIAS[CATEGORIAS.length - 1];
    }
  };
})();
