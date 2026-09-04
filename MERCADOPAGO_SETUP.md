# Activación de suscripciones

La integración deja las credenciales exclusivamente en el servidor. Nunca uses el prefijo `NEXT_PUBLIC_` para secretos.

1. Crear una aplicación en Mercado Pago Developers y obtener el Access Token de producción.
2. Definir temporalmente `MERCADOPAGO_ACCESS_TOKEN`, `LABOVET_MONTHLY_PRICE` y `NEXT_PUBLIC_APP_URL` y ejecutar `npm run mercadopago:create-plan` una sola vez.
3. Guardar el ID devuelto como `MERCADOPAGO_PLAN_ID` en Vercel.
4. No hace falta configurar el webhook de Suscripciones en el panel: la aplicación envía `https://labovet-app.vercel.app/api/mercadopago/webhook` como `notification_url` al crear cada suscripción. Si Mercado Pago ofrece una clave secreta para esa notificación, guardarla como `MERCADOPAGO_WEBHOOK_SECRET`; si no, el servidor valida el evento consultando el recurso directamente con el Access Token.
5. Crear una cuenta de servicio de Firebase con acceso mínimo a Authentication y Firestore, convertir el JSON completo a Base64 y guardarlo como `FIREBASE_SERVICE_ACCOUNT_BASE64` en Vercel.
6. Volver a desplegar y probar con una cuenta nueva y un medio de pago de prueba antes de activar producción.

El plan se crea por $25.000 ARS mensuales y 7 días de prueba. El webhook es la fuente de verdad: `authorized` habilita prueba, un pago aprobado activa, `paused` suspende y `cancelled` vence.
