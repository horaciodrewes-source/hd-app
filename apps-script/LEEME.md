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
