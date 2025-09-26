# 🔒 Guía de Seguridad contra XSS

## Resumen de Mejoras Implementadas

### 1. **Frontend (React)**

#### ✅ Utilidades de Sanitización

- **Archivo**: `src/lib/security.ts`
- **Funciones**:
  - `sanitizeHTML()` - Sanitiza HTML usando DOMPurify
  - `sanitizeText()` - Escapa caracteres HTML peligrosos
  - `sanitizeURL()` - Valida y sanitiza URLs
  - `sanitizeFormData()` - Sanitiza objetos de formulario
  - `containsScript()` - Detecta scripts maliciosos

#### ✅ Componentes Seguros

- **Archivo**: `src/components/ui/safe-content.tsx`
- **Componentes**:
  - `<SafeContent>` - Componente genérico para contenido seguro
  - `<SafeText>` - Para texto plano (sin HTML)
  - `<SafeHTML>` - Para HTML sanitizado

#### ✅ Mejoras en Formularios

- **Archivo**: `src/components/demo.FormComponents.tsx`
- **Cambios**: Mensajes de error ahora usan `<SafeText>`

### 2. **Backend (Deno/Hono)**

#### ✅ Utilidades de Seguridad

- **Archivo**: `Backend/utils/security.ts`
- **Funciones**:
  - `sanitizeText()` - Sanitización de texto
  - `sanitizeHTML()` - Sanitización de HTML
  - `validateEmail()` - Validación segura de email
  - `validatePhone()` - Validación segura de teléfono
  - `containsDangerousContent()` - Detección de contenido peligroso

#### ✅ Headers de Seguridad

- **Headers implementados**:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `X-XSS-Protection: 1; mode=block`
  - `Content-Security-Policy` - Política de seguridad de contenido
  - `Strict-Transport-Security` - Forzar HTTPS
  - `Permissions-Policy` - Control de permisos

#### ✅ Middleware de Seguridad

- **Archivo**: `Backend/main.ts`
- **Implementado**: `securityHeadersMiddleware()`

## 🛡️ Mejores Prácticas Implementadas

### 1. **Sanitización de Entrada**

```typescript
// ✅ Correcto
const safeText = sanitizeText(userInput);
const safeHTML = sanitizeHTML(userHTML);

// ❌ Incorrecto
element.innerHTML = userInput; // Vulnerable a XSS
```

### 2. **Componentes React Seguros**

```tsx
// ✅ Correcto
<SafeText content={userInput} />
<SafeHTML content={userHTML} />

// ❌ Incorrecto
<div dangerouslySetInnerHTML={{ __html: userInput }} />
```

### 3. **Validación de URLs**

```typescript
// ✅ Correcto
const safeURL = sanitizeURL(userURL);

// ❌ Incorrecto
window.location.href = userURL; // Vulnerable
```

### 4. **Headers de Seguridad**

```typescript
// Implementado automáticamente en todas las respuestas
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Content-Security-Policy: default-src 'self'...
```

## 🚨 Patrones Peligrosos Detectados

### 1. **Scripts Maliciosos**

- `<script>` tags
- `javascript:` protocolos
- Event handlers (`onclick`, `onload`, etc.)
- `vbscript:` protocolos
- `data:` URLs

### 2. **Contenido Peligroso**

- `<iframe>` tags
- `<object>` tags
- `<embed>` tags
- URLs con protocolos no seguros

## 📋 Checklist de Seguridad

### Frontend

- [x] DOMPurify instalado y configurado
- [x] Componentes seguros implementados
- [x] Sanitización de entrada de usuario
- [x] Validación de URLs
- [x] Escape de caracteres HTML

### Backend

- [x] Headers de seguridad implementados
- [x] Sanitización de datos de entrada
- [x] Validación de email y teléfono
- [x] Detección de contenido peligroso
- [x] Middleware de seguridad activo

### Configuración

- [x] Content Security Policy configurado
- [x] CORS configurado correctamente
- [x] Rate limiting activo
- [x] Logging de seguridad

## 🔧 Configuración de DOMPurify

```typescript
const PURIFY_CONFIG = {
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'br', 'p', 'span'],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
  KEEP_CONTENT: false,
  RETURN_DOM: false,
  SANITIZE_DOM: true
};
```

## 🧪 Testing de Seguridad

### 1. **Pruebas de XSS**

```javascript
// Estos payloads deben ser bloqueados
const testPayloads = [
  '<script>alert("XSS")</script>',
  'javascript:alert("XSS")',
  '<img src="x" onerror="alert(\'XSS\')">',
  '<iframe src="javascript:alert(\'XSS\')"></iframe>'
];
```

### 2. **Validación de Headers**

```bash
# Verificar headers de seguridad
curl -I https://tu-api.com/api/health
```

## 📚 Recursos Adicionales

- [OWASP XSS Prevention](https://owasp.org/www-project-cheat-sheets/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [DOMPurify Documentation](https://github.com/cure53/DOMPurify)
- [Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [Hono Security](https://hono.dev/guides/security)

## 🔄 Mantenimiento

### Actualizaciones Regulares

1. Mantener DOMPurify actualizado
2. Revisar y actualizar CSP headers
3. Monitorear logs de seguridad
4. Actualizar patrones de detección

### Monitoreo

1. Revisar logs de errores de seguridad
2. Monitorear intentos de XSS
3. Verificar headers de seguridad
4. Testing regular de vulnerabilidades

---

**Nota**: Esta guía debe ser actualizada regularmente con nuevas amenazas y mejores prácticas de seguridad.
