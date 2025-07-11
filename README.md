# Backend - Sistema de Gestión de Pedidos

## 🚀 Características Principales

- **Autenticación y Autorización** robusta con Supabase Auth
- **Validación de Entrada** con Zod en todos los endpoints críticos
- **Gestión de Órdenes** con sincronización offline
- **Notificaciones Push** y WhatsApp
- **Monitoreo de Seguridad** en tiempo real
- **Resolución de Conflictos** automática
- **Rate Limiting** y protección CSRF

## 🛡️ Seguridad Implementada

### Validación de Entrada con Zod

Todos los endpoints que reciben datos del usuario están protegidos con validación robusta:

```typescript
// Ejemplo de uso
import { validateRequest, getValidatedData } from "../middleware/validation.ts";
import { createOrderSchema } from "../utils/validation.ts";

orders.post("/", 
  authMiddleware, 
  validateRequest(createOrderSchema),
  async (c) => {
    const data = getValidatedData<typeof createOrderSchema._type>(c);
    // Los datos están validados y tipados
  }
);
```

### Endpoints Protegidos

- ✅ **13/15 endpoints críticos** con validación Zod
- ✅ **Sanitización automática** de strings
- ✅ **Validación de tipos** estricta
- ✅ **Mensajes de error** específicos por campo

Ver [VALIDATION_IMPROVEMENTS.md](./docs/VALIDATION_IMPROVEMENTS.md) para detalles completos.

## 📁 Estructura del Proyecto

```bash
Backend/
├── routes/           # Endpoints de la API
├── middleware/       # Middlewares (auth, validation, etc.)
├── services/         # Lógica de negocio
├── utils/           # Utilidades (validation, security, etc.)
├── types/           # Tipos TypeScript
├── docs/            # Documentación
└── tests/           # Tests automáticos
```

## 🚀 Inicio Rápido

### Prerrequisitos

- Deno 1.40+
- Supabase account
- Variables de entorno configuradas

### Instalación

| Paso | Acción | Comando |
|------|--------|---------|
| 1 | **Clonar y configurar** | ```bash<br>cd Backend<br>cp monitoring.env.example monitoring.env<br># Editar monitoring.env con tus credenciales<br>``` |
| 2 | **Instalar dependencias** | ```bash<br>deno cache main.ts<br>``` |
| 3 | **Ejecutar en desarrollo** | ```bash<br>deno task dev<br>``` |
| 4 | **Ejecutar tests** | ```bash<br>deno task test<br>``` |

## 🔧 Configuración

### Variables de Entorno

```env
# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Stripe
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_PRICE_ID=your_stripe_price_id

# WhatsApp
WHATSAPP_TOKEN=your_whatsapp_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id

# Monitoreo
MONITORING_ENABLED=true
ALERT_PHONE_NUMBERS=+525512345678,+525512345679
```

## 📚 Documentación

- [**Validación de Entrada**](./docs/VALIDATION_IMPROVEMENTS.md) - Sistema completo de validación con Zod
- [**Autenticación y Seguridad**](./docs/AUTHENTICATION_SECURITY_SUMMARY.md) - Sistema de autenticación robusto
- [**Protección CSRF**](./docs/CSRF_IMPLEMENTATION.md) - Implementación de tokens CSRF
- [**Protección XSS**](./XSS_PROTECTION_ENHANCEMENTS.md) - Prevención de ataques XSS
- [**Monitoreo**](./docs/MONITORING_README.md) - Sistema de monitoreo y alertas
- [**WhatsApp Integration**](./docs/WHATSAPP_INTEGRATION_README.md) - Integración con WhatsApp

## 🔌 Endpoints Principales

### Autenticación

- `POST /auth/register` - Registro de usuarios
- `POST /auth/login` - Inicio de sesión
- `POST /auth/logout` - Cerrar sesión
- `GET /auth/profile` - Perfil del usuario

### Negocios

- `POST /business/activate-trial` - Activar trial gratuito
- `POST /business/employees/invite` - Invitar empleados
- `PATCH /business/settings` - Actualizar configuración
- `GET /business/employees` - Listar empleados

### Órdenes

- `POST /orders` - Crear nueva orden
- `PATCH /orders/:id` - Actualizar orden
- `POST /orders/sync` - Sincronizar órdenes offline
- `GET /orders/today` - Órdenes de hoy

### Notificaciones

- `POST /notifications/subscribe` - Suscribir dispositivo
- `POST /notifications/notify-business-owners` - Notificar dueños

### Monitoreo

- `POST /monitoring/configure` - Configurar alertas
- `POST /monitoring/security/log` - Logs de seguridad
- `POST /monitoring/test-alert` - Probar alertas

## 🧪 Testing

### Ejecutar Todos los Tests

```bash
deno task test
```

### Tests de Validación

```bash
deno test utils/validation.test.ts --allow-env --allow-net
```

### Tests de Seguridad

```bash
deno test utils/security.test.ts --allow-env --allow-net
```

## 🔒 Seguridad

### Características Implementadas

1. **Validación de Entrada Robusta**
   - Schemas Zod para todos los endpoints críticos
   - Sanitización automática de strings
   - Validación de tipos estricta

2. **Autenticación y Autorización**
   - JWT tokens con Supabase Auth
   - Roles y permisos granulares
   - Rate limiting en endpoints sensibles

3. **Protección CSRF**
   - Tokens CSRF en formularios
   - Validación de origen de requests

4. **Monitoreo de Seguridad**
   - Detección de intentos XSS
   - Logs de seguridad estructurados
   - Alertas automáticas por WhatsApp

5. **Rate Limiting**
   - Límites por IP y usuario
   - Protección contra ataques de fuerza bruta

## 🚀 Despliegue

### Deno Deploy

```bash
deno task deploy
```

### Variables de Entorno en Producción

Asegúrate de configurar todas las variables de entorno necesarias en tu plataforma de despliegue.

## 📊 Monitoreo

### Métricas Disponibles

- Tasa de errores de validación
- Tiempo de respuesta de endpoints
- Uso de recursos del servidor
- Intentos de ataques detectados

### Alertas Automáticas

- Errores críticos por WhatsApp
- Intentos de XSS detectados
- Fallos de autenticación masivos

## 🤝 Contribución

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📝 Licencia

Este proyecto está bajo la Licencia MIT. Ver el archivo `LICENSE` para más detalles.

## 🆘 Soporte

Para soporte técnico o preguntas sobre seguridad:

- Revisa la documentación en `./docs/`
- Ejecuta los tests para verificar la configuración
- Contacta al equipo de desarrollo

---

**⚠️ Importante:** Este backend incluye múltiples capas de seguridad. Asegúrate de revisar toda la documentación antes de desplegar en producción.
