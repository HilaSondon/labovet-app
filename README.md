# LabOVet - Planillas SIGATM

Aplicación web para veterinarios que transforma datos de Excel, WhatsApp o carga manual en planillas compatibles con SIGATM.

## Alcance actual

- Home comercial de LabOVet.
- Registro e ingreso exclusivo para veterinarios mediante Firebase Authentication.
- Activación y suspensión de cuentas desde el panel administrador.
- Estandarizador SIGATM con validación previa.
- Instructivo visual de carga.
- Servicio administrativo completo de LabOVet.

La versión integral anterior se conserva en la rama `codex/archive-pre-sigatm`.

## Desarrollo local

```bash
npm install
npm run dev
```

Para trabajar sin afectar los datos reales se recomienda `npm run dev:emulator`.

El acceso directo de Windows abre `public/sigatm/index.html`, que conserva una versión local y sin conexión de la herramienta.

## Publicación

La rama principal está conectada con Vercel. Las ramas de trabajo generan vistas previas antes de pasar a producción.

Firebase utiliza el proyecto configurado en `.firebaserc`. Los datos de usuarios existentes se conservan; no deben copiarse credenciales dentro del repositorio.
