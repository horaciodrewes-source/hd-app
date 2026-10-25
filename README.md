# HD Interna

App web interna de HD Máquinas Ópticas para el equipo: fichaje con QR, asistencia, ausencias, licencias, vacaciones, lista de precios, folletos, agenda de campo, tareas, cartelera, recordatorios y recibos de sueldo. Cada persona ve y edita según su rol.

**Estado: versión de prueba.** Los datos son de ejemplo y se guardan solo en el navegador de quien la usa. El próximo paso es conectar Firebase para el ingreso con cuenta de Google y para guardar los datos reales en forma privada.

## Archivos

- `index.html`: la página.
- `css/styles.css`: estilos (se adapta a celular y modo oscuro).
- `js/permisos.js`: roles y qué puede hacer cada uno. Es el único lugar donde están las reglas de acceso.
- `js/datos.js`: guardado de datos y datos de ejemplo. Es el archivo que se reemplaza al conectar Firebase.
- `js/app.js`: pantallas y navegación.

## Probarla en la computadora

Abrir una terminal en esta carpeta y ejecutar `python3 -m http.server`, luego entrar a http://localhost:8000.
