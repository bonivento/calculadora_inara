# Calculadora de precios — Inara by Alma (SPEC compartida)

Sitio estático (sin build, sin servidor) para Vercel. Mismo stack que `../inara_web`: HTML + Tailwind CDN 3.4.17 con
`assets/js/tw-config.js` (tokens de marca YA copiados), `assets/css/site.css` (YA copiado), JS vanilla (sin módulos ES,
scripts clásicos que cuelgan de `window.CI`). Idioma: español (es-CO). Moneda: COP, sin decimales.
Node NO está instalado: nada de npm. Las pruebas se hacen en navegador (`tests/index.html`).

Marca: fondo `bg-surface` (#fafaee), primario oliva `primary` #5d5e38, secundario dorado `secondary` #725b27 / `gold` #c3a66a,
títulos `font-headline` (Playfair Display), etiquetas `font-label uppercase` (Montserrat), cuerpo `font-body`. Radios pequeños
(`rounded-lg/xl`), sombras `shadow-soft/card/lift`, iconos Material Symbols Outlined, logos en `assets/brand/`.
Clases ya usadas en inara_web: `text-label-md`, `text-body-md`, `text-headline-md`, `px-margin-mobile`, `select-botanic`, etc.
Mobile-first, accesible (labels, foco visible, `aria-*`).

## Archivos y dueños (NO editar archivos de otro dueño)
| Archivo | Dueño |
|---|---|
| `assets/js/calc.js`, `tests/index.html`, `tests/calc.tests.js` | A (motor) |
| `index.html`, `assets/js/app.js` (util `CI.util`, tabs, toasts), `assets/css/app.css`, `site.webmanifest`, `vercel.json`, `README.md` | B (shell) |
| `assets/js/store.js`, `assets/js/defaults.js`, `assets/js/ui-insumos.js`, `assets/js/ui-ajustes.js` | C (datos + insumos + ajustes) |
| `assets/js/ui-calculadora.js`, `assets/js/ui-productos.js` | D (calculadora + mis productos) |

Orden de carga en `index.html`: tw-config.js → util/app.js NO al final: `app.js` define `CI.util` y debe cargarse PRIMERO,
luego `defaults.js`, `store.js`, `calc.js`, `ui-insumos.js`, `ui-ajustes.js`, `ui-calculadora.js`, `ui-productos.js`, y al final
`CI.app.start()` (en un `<script>` inline al final o `DOMContentLoaded`). Así `app.js` no ejecuta nada hasta `start()`.

Contenedores de vistas en index.html: `#view-calculadora`, `#view-productos`, `#view-insumos`, `#view-ajustes`.
Cada UI expone `CI.ui.<nombre>.mount(containerEl)` (se llama una vez en start) y `CI.ui.<nombre>.onShow()` (opcional, cada vez
que se muestra la vista). Nombres: `calculadora`, `productos`, `insumos`, `ajustes`.
Navegación entre vistas: `CI.app.go('calculadora'|'productos'|'insumos'|'ajustes', params?)`. Para editar una receta guardada desde
Productos: `CI.app.go('calculadora', {recetaId})`; la UI de calculadora implementa `CI.ui.calculadora.load(recetaId)`.
Hash routing (`#calculadora`, etc.) lo maneja B.

## CI.util (B) — helpers globales
`CI.util.fmtCOP(n)` → "$12.500" (es-CO, sin decimales); `fmtNum(n, dec=1)`; `fmtPct(n,dec=1)`; `uid()`; `toast(msg, tipo='ok'|'error')`;
`el(tag, attrs, ...children)` mini-hyperscript; `escapeHtml(s)`; `debounce(fn, ms)`; `confirmDialog(msg)` → Promise<boolean> (usar `<dialog>` propio,
NUNCA `window.confirm/alert`); `download(filename, text, mime)`; `num(v, def=0)` parsea número tolerante ("1.234,5" y "1234.5").

## Modelo de datos (localStorage, claves `ci.v1.insumos`, `ci.v1.recetas`, `ci.v1.settings`)
Unidades base: `g`, `ml`, `un`. Todas las cantidades de recetas se expresan en la unidad del insumo.
Costo unitario de un insumo = `precioCompra / cantidadCompra` (por g, ml o un). (Ej.: cera de soya 1 kg a 38.000 → precioCompra 38000, cantidadCompra 1000, unidad g.)

### Insumo
```
{ id, categoria, nombre, unidad:'g'|'ml'|'un', precioCompra, cantidadCompra, proveedor?, notas?,
  // opcionales según categoría:
  densidad?   (g/ml, cera; por defecto 0.9),
  capacidadMl?(envase: ml de cera que cabe al ras),
  capacidadG? (molde: gramos de cera/jabón que caben),
  usos?       (molde/envase reutilizable: usos de vida útil para amortizar; por defecto 100),
  sapNaoh?    (aceite/manteca: g de NaOH por g de aceite, ej. coco 0.183, oliva 0.134),
  pureza?     (soda: % de pureza, ej. 98) }
```
Categorías (`CI.defaults.CATEGORIAS` = array de `{id,label,icon,unidad}`): `cera, fragancia, colorante, mecha, envase, molde, empaque, aceite, soda, aditivo, base, otro`.

### Settings (`CI.store.getSettings()`)
```
{ nombreNegocio:'Inara by Alma',
  manoObraHora: 12000,        // COP/h tu tiempo (¡pagarte a ti!)
  energiaHora: 2500,          // COP/h gas/electricidad del taller mientras produces
  indirectosPct: 10,          // alquiler, servicios, internet, publicidad, depreciación de equipos (% sobre materiales+mano de obra+energía)
  mermaPct: 3,                // pérdida de materiales por defecto (derrames, fallas, pruebas)
  metodoPrecio:'margen'|'recargo', // margen = utilidad/precio ; recargo = utilidad/costo
  margenDetalPct: 50,         // margen deseado detal
  margenMayoristaPct: 30,     // margen deseado mayorista
  redondeoA: 500,             // redondear precio hacia arriba a múltiplos de N (0 = no)
  comisionPct: 3.4, comisionFija: 900, aplicarComision: false, // pasarela/marketplace (ej. Wompi/MercadoPago)
  ivaPct: 19, aplicarIva: false, // si eres responsable de IVA
  moneda:'COP' }
```

### Receta (común)
```
{ id, tipo:'vela'|'jabon', nombre, formato (texto libre: 'Vaso 8oz','Molde pilar','Barra 100g'...), notas?,
  unidadesPorLote,            // cuántas unidades salen por tanda (jabón: barras tras cortar)
  manoObraMin,                // minutos de tu trabajo POR LOTE (incluye preparar, verter, empacar, limpiar)
  energiaMin,                 // minutos de energía POR LOTE (derretir cera, etc.)
  extras:[{insumoId, cantidad}],      // empaque/etiquetas/cajas POR UNIDAD
  costosExtra:[{concepto, monto, porLote:boolean}], // otros costos libres (porLote true = se divide entre unidadesPorLote)
  mermaPct:null|number,       // override de settings
  margenDetalPct:null|number, margenMayoristaPct:null|number, // overrides
  precioActual:null|number,   // precio al que vendes hoy (para comparar)
  creado, actualizado }       // ISO strings
```
### Receta vela (`tipo:'vela'`, campo `vela`)
```
vela:{ ceras:[{insumoId, pct}],   // mezcla, pct suman 100
       envaseId:null|id,          // vaso/lata/frasco (capacidadMl)
       moldeId:null|id,           // molde (capacidadG)
       llenadoPct:90,             // % de la capacidad del envase que se llena
       pesoCeraG:null|number,     // override manual de gramos de cera por unidad
       fraganciaId:null|id, fraganciaPct:8,   // % sobre peso de cera
       colorantes:[{insumoId, cantidad}],     // por unidad
       mechas:[{insumoId, cantidad}] }        // por unidad
```
Cera por unidad: `pesoCeraG` si existe; si no, envase → `capacidadMl × llenadoPct/100 × densidad_mezcla`; si no, molde → `capacidadG`.
Si hay envase Y molde, el envase manda para el peso y ambos suman costo (el molde amortizado). Costo de envase: si `usos>1` se amortiza `costo/usos`
(envases de un solo uso tienen usos=1 → costo completo). Molde: `costo/usos` (def. 100).
### Receta jabón (`tipo:'jabon'`, campo `jabon`)
```
jabon:{ metodo:'frio'|'glicerina',
        aceites:[{insumoId, g}],          // por LOTE (frío)
        bases:[{insumoId, g}],            // por LOTE (glicerina melt&pour)
        superGrasaPct:5, aguaPct:33,      // agua como % del peso de aceites
        sodaId:null|id,
        fraganciaId:null|id, fraganciaPct:3,   // % sobre peso de aceites (o base)
        aditivos:[{insumoId, g}],         // por LOTE (arcilla, avena, flores...)
        moldeId:null|id, moldeUsos:null,
        mermaCuradoPct:15,                // pérdida de peso por evaporación en el curado
        semanasCurado:4 }
```
Soda cáustica (frío): `NaOH_g = Σ(g_aceite × sapNaoh) × (1 − superGrasaPct/100) / (pureza/100)`; `agua_g = aguaPct/100 × Σ g_aceite`.
Peso crudo del lote = aceites+soda+agua+fragancia+aditivos; peso curado = crudo×(1−merma); peso por barra = curado/unidadesPorLote.

## Motor (A): `CI.calc`
`CI.calc.calcular(receta, insumosById, settings)` → **resultado** (puro, sin DOM, nunca lanza; datos faltantes → advertencias):
```
{ ok:boolean,
  unidades, 
  lineas:[{grupo:'materiales'|'manoObra'|'energia'|'extras'|'indirectos'|'merma', concepto, cantidad?, unidad?, costoLote, costoUnidad, categoria?}],
  costos:{ materialesLote, extrasLote, manoObraLote, energiaLote, mermaLote, indirectosLote, totalLote,
           materialesUnidad, manoObraUnidad, energiaUnidad, indirectosUnidad, mermaUnidad, totalUnidad },
  tecnico:{ vela?:{ cerasG:[{insumoId,g}], cerasTotalGUnidad, fraganciaGUnidad, pesoUnidadG },
            jabon?:{ naohG, aguaG, aceitesG, crudoG, curadoG, pesoBarraG, superGrasaPct, ... } },
  precio:{ metodo, detal:{ base, conComision, conIva, final, utilidadUnidad, margenRealPct, recargoRealPct },
           mayorista:{ ...igual }, minimo /* = costo unitario, punto de equilibrio */, 
           actual?:{ precio, utilidadUnidad, margenRealPct, estado:'perdida'|'bajo'|'ok' } },
  advertencias:[{nivel:'error'|'aviso'|'info', texto}] }
```
Fórmulas de precio (por unidad): `base = costo/(1−m)` si método margen (m = margen/100), `costo×(1+m)` si recargo.
Comisión (si aplica): `conComision = (base + comisionFija)/(1 − comisionPct/100)`. IVA (si aplica): `conIva = conComision×(1+iva/100)`.
`final` = el último valor redondeado HACIA ARRIBA al múltiplo `redondeoA`. `margenRealPct`/`utilidadUnidad` se calculan sobre el precio final SIN IVA y
descontando comisión realmente cobrada (utilidad = precioSinIva − comisión − costo). Merma: `mermaLote = (materiales+extras)×merma%`.
Indirectos = `indirectosPct × (materiales+extras+mermaLote+manoObra+energía)`.
Advertencias mínimas: cera sin definir; % de mezcla ≠ 100; fragancia > 10% (límite típico soya 6–10%), > 12% crítico; sin mecha; precio actual < costo;
jabón: superGrasa < 0 o > 10, agua fuera de 25–40%, sin soda para método frío, sin sapNaoh en un aceite; mano de obra = 0; insumo con precio 0.
Funciones auxiliares exportadas: `CI.calc.costoUnitarioInsumo(insumo)`, `CI.calc.pesoCeraUnidad(receta, insumosById)`, `CI.calc.calcularLejia(aceites,insumosById,superGrasaPct,aguaPct,pureza)`,
`CI.calc.redondear(valor, paso)`, `CI.calc.precioDesdeCosto(costo, margenPct, metodo)`.

## Store (C): `CI.store`
```
getSettings() / saveSettings(patch)
listInsumos() / getInsumo(id) / insumosById() / saveInsumo(obj) → obj con id / deleteInsumo(id) → {ok, usadoEn:[nombresRecetas]}
listRecetas() / getReceta(id) / saveReceta(obj) → obj / deleteReceta(id) / duplicateReceta(id) → nueva
newReceta(tipo) → receta en blanco con valores por defecto del modelo
exportAll() → string JSON {version:1, insumos, recetas, settings} / importAll(jsonString, {reemplazar:boolean}) → {ok, error?}
resetDefaults()   // vuelve a insumos/recetas/ajustes de ejemplo
on(fn) / off(fn)  // fn({tipo:'insumos'|'recetas'|'settings'}) tras cada cambio
```
La primera vez (localStorage vacío) se siembran `CI.defaults` (C): ajustes por defecto, ~30 insumos realistas de Colombia en COP (ceras: soya, coco-soya, parafina,
cera de abejas; fragancias; colorantes; mechas de algodón/madera; vasos/frascos/latas con capacidadMl; moldes de silicona/acrílico con capacidadG; aceites con sapNaoh reales
(coco, oliva, palma, ricino, karité, cacao, almendras, aguacate…); soda cáustica; arcillas/avena/carbón/cúrcuma; base de glicerina; cajas, bolsas, etiquetas, cintas, cartón)
y 3 recetas de ejemplo (vela en vaso, vela en molde, jabón frío). Todo editable por la usuaria.

## Funcionalidad de las vistas
- **Calculadora (D)**: selector Vela/Jabón; formulario por secciones (colapsables) según el modelo; panel de resultado en vivo (sticky en desktop, barra inferior en móvil con el precio sugerido) con desglose por grupo
  (barras/lista), costo por unidad, precio detal y mayorista, utilidad, margen real, comparación con `precioActual`, datos técnicos (gramos de cera, fragancia, lejía de soda…), advertencias.
  Selectores de insumos filtrados por categoría; «+ nuevo insumo» ligero que lleva a la vista Insumos. Guardar / guardar como nuevo / nueva receta. Escenarios: la usuaria puede cambiar `unidadesPorLote` y márgenes y ver el efecto al instante.
  Para el desglose usa barras CSS simples (sin librerías).
- **Mis productos (D)**: tarjetas/tabla de recetas guardadas con costo, precio detal, mayorista, margen; buscar, filtrar por tipo, ordenar; editar, duplicar, eliminar; exportar CSV/lista de precios (copiar texto para WhatsApp); recalcular al cambiar insumos/ajustes.
- **Insumos (C)**: tabla/tarjetas por categoría con buscar y filtro; crear/editar/eliminar (diálogo `<dialog>`); costo unitario calculado visible; campos extra por categoría; avisa si el insumo está en uso.
- **Ajustes (C)**: edita Settings con explicaciones cortas de cada concepto (qué es mano de obra, indirectos, merma, margen vs recargo…); exportar/importar copia de seguridad JSON; restablecer datos de ejemplo (con confirmación).
