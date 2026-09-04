# Activación de suscripciones

La integración deja las credenciales exclusivamente en el servidor. Nunca uses el prefijo `NEXT_PUBLIC_` para secretos.

1. Crear una aplicación en Mercado Pago Developers y obtener el Access Token de producción.
2. Definir temporalmente `MERCADOPAGO_ACCESS_TOKEN`, `LABOVET_MONTHLY_PRICE` y `NEXT_PUBLIC_APP_URL` y ejecutar `npm run mercadopago:create-plan` una sola vez.
3. Guardar el ID devuelto como `MERCADOPAGO_PLAN_ID` en Vercel.
4. En Mercado Pago configurar el webhook `https://labovet-app.vercel.app/api/mercadopago/webhook` para suscripciones y pagos autorizados; guardar la clave secreta como `MERCADOPAGO_WEBHOOK_SECRET`.
5. Crear una cuenta de servicio de Firebase con acceso mínimo a Authentication y Firestore, convertir el JSON completo a Base64 y guardarlo como `FIREBASE_SERVICE_ACCOUNT_BASE64` en Vercel.
6. Volver a desplegar y probar con una cuenta nueva y un medio de pago de prueba antes de activar producción.

El plan se crea por $25.000 ARS mensuales y 7 días de prueba. El webhook es la fuente de verdad: `authorized` habilita prueba, un pago aprobado activa, `paused` suspende y `cancelled` vence.
