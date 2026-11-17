# Conectar la carpeta de Drive con la app (una sola vez)

1. Entrá a https://script.google.com con la cuenta de Horacio y tocá **Nuevo proyecto**.
2. Ponele de nombre **HD Interna Catálogo**.
3. Borrá lo que aparece y pegá todo el contenido de `Codigo.gs`. Guardá (ícono del disquete).
4. Arriba a la derecha: **Implementar → Nueva implementación**.
   - Tipo: **Aplicación web**.
   - Ejecutar como: **Yo**.
   - Quién tiene acceso: **Cualquier usuario**.
5. Tocá **Implementar**. Google pide permiso para leer tu Drive: **Autorizar acceso**, elegí tu cuenta,
   y si aparece "Google no verificó esta app", tocá **Configuración avanzada → Ir a HD Interna Catálogo**.
6. Copiá la **URL de la aplicación web** (termina en `/exec`) y pasásela a Claude.

Si más adelante se cambia el código: Implementar → Administrar implementaciones → editar (lápiz) → Versión: nueva → Implementar. La URL no cambia.

## Facturas escaneadas (desde la versión 2026.11.17)

El mismo programa recibe las facturas que se escanean en la app y las guarda en la carpeta
"Varios Husky / 00 Fact proveedores". Para activarlo:

1. En el proyecto **HD Interna Catálogo**, reemplazá todo el código por el nuevo `Codigo.gs` y guardá.
2. **Implementar → Administrar implementaciones →** lápiz **→ Versión: Nueva versión → Implementar.**
3. Google vuelve a pedir permiso, ahora para **crear** archivos en tu Drive: **Autorizar acceso** y seguí los mismos pasos que la primera vez.

La URL no cambia.
