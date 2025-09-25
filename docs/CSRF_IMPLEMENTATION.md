# 🔒 Implementación de Protección CSRF

## Resumen

Se ha implementado una protección CSRF completa en la aplicación PedidoList, tanto en el backend (Deno/Hono) como en el frontend (React).

## ✅ Estado Actual

### Backend (Deno/Hono)

#### 1. **Middleware CSRF Implementado**

- **Archivo**: `Backend/utils/csrf.ts`
- **Funciones**:
  - `generateCSRFToken()` - Genera tokens únicos con expiración
  - `validateCSRFToken()` - Valida tokens contra el almacén
  - `csrfProtection()` - Middleware para proteger rutas
  - `csrfTokenGenerator()` - Middleware para generar tokens

#### 2. **Ruta CSRF Creada**

- **Endpoint**: `GET /api/auth/csrf/token`
- **Archivo**: `Backend/routes/auth.ts`
- **Funcionalidad**: Genera y retorna tokens CSRF

#### 3. **Middleware Aplicado**

- **Archivo**: `Backend/main.ts`
- **Aplicación**:

  ```typescript
  // Headers de seguridad globales
  app.use("*", securityHeadersMiddleware());
  
  // Protección CSRF para todas las rutas de API
  app.use("/api/*", csrfProtection());
  ```

#### 4. **CORS Actualizado**

- **Headers permitidos**: `X-Session-ID`, `X-CSRF-Token`
- **Headers expuestos**: `X-CSRF-Token`

### Frontend (React)

#### 1. **Hook CSRF Implementado**

- **Archivo**: `pedidolist-app/src/hooks/useCSRF.ts`
- **Funciones**:
  - `useCSRF()` - Hook para manejar tokens CSRF
  - `useCSRFRequest()` - Hook para hacer peticiones con CSRF

#### 2. **Hooks Actualizados**

- **useAuth**: Todas las peticiones de autenticación usan CSRF
- **useOrders**: Todas las peticiones de pedidos usan CSRF
- **useOfflineSync**: Todas las peticiones de sincronización usan CSRF

## 🔧 Cómo Funciona

### 1. **Generación de Tokens**

```typescript
// El frontend genera un sessionId único
const sessionId = crypto.randomUUID();

// Solicita un token CSRF al backend
const response = await fetch('/api/auth/csrf/token', {
  headers: { 'X-Session-ID': sessionId }
});

// El backend genera y retorna el token
const token = response.headers.get('X-CSRF-Token');
```

### 2. **Validación de Tokens**

```typescript
// En cada petición que modifica datos (POST, PUT, PATCH, DELETE)
const response = await csrfRequest('/api/orders', {
  method: 'POST',
  body: JSON.stringify(data)
});

// El hook automáticamente incluye:
// - X-Session-ID: sessionId
// - X-CSRF-Token: token
// - Authorization: Bearer authToken
```

### 3. **Protección Automática**

```ts
// El middleware CSRF valida automáticamente:
// 1. Que el sessionId existe
// 2. Que el token CSRF existe
// 3. Que el token es válido y no ha expirado
// 4. Que el token corresponde al sessionId
```

## 🛡️ Características de Seguridad

### 1. **Expiración de Tokens**

- **Duración**: 30 minutos
- **Limpieza automática**: Tokens expirados se eliminan automáticamente

### 2. **Validación Estricta**

- **Session ID requerido**: Cada token está vinculado a una sesión
- **Validación de método**: Solo se valida en métodos que modifican datos
- **Reintentos automáticos**: Si el token expira, se obtiene uno nuevo

### 3. **Headers de Seguridad**

```typescript
// Headers implementados automáticamente:
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Content-Security-Policy: default-src 'self'...
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

## 📋 Checklist de Implementación

### Backend ✅

- [x] Middleware CSRF implementado
- [x] Ruta para generar tokens creada
- [x] Middleware aplicado a rutas de API
- [x] CORS configurado para headers CSRF
- [x] Headers de seguridad implementados
- [x] Validación de tokens implementada

### Frontend ✅

- [x] Hook useCSRF implementado
- [x] Hook useCSRFRequest implementado
- [x] useAuth actualizado para usar CSRF
- [x] useOrders actualizado para usar CSRF
- [x] useOfflineSync actualizado para usar CSRF
- [x] Manejo automático de expiración de tokens

### Configuración ✅

- [x] Headers CORS actualizados
- [x] Middleware de seguridad aplicado
- [x] Rutas protegidas configuradas
- [x] Manejo de errores implementado

## 🧪 Testing - ✅ VERIFICADO

### 1. **Verificar Protección CSRF** ✅

```bash
# Sin token CSRF (debe fallar)
curl -X POST http://localhost:3030/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-token" \
  -d '{"test": "data"}'
# Respuesta: {"error":"CSRF token requerido","code":"CSRF_TOKEN_MISSING"}
```

### 2. **Verificar Generación de Tokens** ✅

```bash
# Obtener token CSRF
curl -X GET http://localhost:3030/api/auth/csrf/token \
  -H "X-Session-ID: test-session-123"
# Respuesta: 200 OK con X-CSRF-Token: 156705c0-e232-4e90-b657-c606b3dd808e
```

### 3. **Verificar Validación** ✅

```bash
# Con token válido (pasa validación CSRF, falla en auth)
curl -X POST http://localhost:3030/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-token" \
  -H "X-Session-ID: test-session-123" \
  -H "X-CSRF-Token: 156705c0-e232-4e90-b657-c606b3dd808e" \
  -d '{"test": "data"}'
# Respuesta: {"error":"Token inválido o expirado","code":"AUTH_TOKEN_INVALID"}
# ✅ CSRF pasa, falla en autenticación (comportamiento correcto)
```

### 4. **Verificar Token Inválido** ✅

```bash
# Con token CSRF inválido
curl -X POST http://localhost:3030/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-token" \
  -H "X-Session-ID: test-session-123" \
  -H "X-CSRF-Token: invalid-token" \
  -d '{"test": "data"}'
# Respuesta: {"error":"CSRF token inválido","code":"CSRF_TOKEN_INVALID"}
```

### 5. **Verificar Vinculación de Sesión** ✅

```bash
# Token válido con session ID diferente
curl -X POST http://localhost:3030/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-token" \
  -H "X-Session-ID: different-session" \
  -H "X-CSRF-Token: 156705c0-e232-4e90-b657-c606b3dd808e" \
  -d '{"test": "data"}'
# Respuesta: {"error":"CSRF token inválido","code":"CSRF_TOKEN_INVALID"}
# ✅ Los tokens están vinculados a sesiones específicas
```

## 🔄 Flujo de Trabajo

1. **Inicio de sesión**: El usuario se autentica normalmente
2. **Generación de token**: El frontend solicita un token CSRF
3. **Almacenamiento**: El token se almacena en el estado del hook
4. **Peticiones protegidas**: Todas las peticiones que modifican datos incluyen el token
5. **Validación**: El backend valida el token en cada petición
6. **Renovación**: Si el token expira, se obtiene uno nuevo automáticamente

## 🚨 Consideraciones de Producción

### 1. **Almacenamiento de Tokens**

- **Actual**: Map en memoria (solo para desarrollo)
- **Producción**: Usar Redis o base de datos para persistencia

### 2. **Rate Limiting**

- Implementar rate limiting en la ruta de generación de tokens
- Prevenir abuso del endpoint de tokens

### 3. **Monitoreo**

- Logs de intentos de CSRF fallidos
- Métricas de tokens generados/validados
- Alertas por patrones sospechosos

## 📚 Recursos Adicionales

- [OWASP CSRF Prevention](https://owasp.org/www-community/attacks/csrf)
- [Hono Security](https://hono.dev/guides/security)
- [React Security Best Practices](https://react.dev/learn/security)

---

**Nota**: Esta implementación proporciona protección CSRF robusta contra ataques de Cross-Site Request Forgery, protegiendo todas las operaciones que modifican datos en la aplicación.
