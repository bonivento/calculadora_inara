# Calculadora de precios — Inara by Alma

Herramienta privada para calcular cuánto cuesta producir y a cuánto vender velas y jabones artesanales. Sitio estático (HTML + Tailwind por CDN + JavaScript vanilla), sin build ni servidor. Moneda: COP.

## Uso

Abre `index.html` en el navegador (o sirve la carpeta con cualquier servidor estático). Hay cuatro secciones:

- **Calculadora**: eliges vela o jabón, llenas la receta (ceras, fragancia, envase, mechas, aceites, soda…) y ves el costo y el precio sugerido al instante. Puedes guardar la receta.
- **Mis productos**: las recetas guardadas con costo, precio detal, mayorista y margen. Editar, duplicar, eliminar y copiar la lista de precios.
- **Insumos**: lo que compras (precio y cantidad de compra). El costo por gramo, mililitro o unidad se calcula solo.
- **Ajustes**: tu hora de trabajo, energía, indirectos, merma, márgenes, redondeo, comisión e IVA. También la copia de seguridad.

La primera vez se cargan insumos, recetas y ajustes de ejemplo; todo es editable.

## El modelo de costos, en simple

1. **Materiales**: lo que realmente entra en cada unidad. El costo de un insumo es `precio de compra / cantidad comprada` (cera de soya, 1 kg a $38.000, cuesta $38 por gramo). Envases y moldes reutilizables se reparten entre sus usos.
2. **Extras por unidad**: caja, etiqueta, bolsa, cinta.
3. **Merma**: un porcentaje de pérdida (derrames, fallas, pruebas) sobre materiales y extras.
4. **Mano de obra**: los minutos de tu trabajo por tanda, a tu valor por hora. Pagarte a ti también cuenta.
5. **Energía**: minutos de gas o electricidad mientras produces.
6. **Indirectos**: alquiler, servicios, internet, publicidad, desgaste de equipos, como porcentaje de todo lo anterior.
7. La suma, dividida entre las unidades de la tanda, es el **costo por unidad**.

**Precio**: con *margen*, la utilidad es un porcentaje del precio (`precio = costo / (1 − margen)`); con *recargo*, es un porcentaje del costo (`precio = costo × (1 + recargo)`). Si cobras con pasarela se suma la comisión, si eres responsable de IVA se suma el IVA, y el resultado se redondea hacia arriba al múltiplo que elijas. Hay precio detal y mayorista.

## Publicar en Vercel (sin build)

Opción 1, CLI:

```
npm i -g vercel   # una vez
vercel            # desde esta carpeta; responde "No" a build/framework
vercel --prod
```

Opción 2, panel web: en vercel.com, *Add New → Project*, importa el repositorio de GitHub (o arrastra la carpeta). Framework: *Other*; sin comando de build; carpeta de salida: la raíz.

`vercel.json` ya incluye cabeceras de seguridad, Content-Security-Policy, caché y `noindex`. Si agregas servicios externos nuevos, ajusta la CSP.

## Tus datos

Todo se guarda en el `localStorage` de **este navegador** (claves `ci.v1.*`). No hay servidor ni cuenta. Si borras los datos del sitio, cambias de navegador o de dispositivo, no los verás. Entra a **Ajustes → Exportar copia de seguridad** con regularidad y guarda el archivo JSON; para recuperar, usa *Importar*.

## Pruebas del motor de cálculo

Abre `tests/index.html` en el navegador.

## Estructura

```
index.html            shell, pestañas, diálogo y toasts
assets/js/app.js      CI.util y CI.app (router por hash)
assets/js/*.js        defaults, store, calc, vistas
assets/css/app.css    componentes (.ci-*)
assets/brand/         logos e iconos
```
