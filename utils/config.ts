// Configuración por entorno
export interface EnvironmentConfig {
  name: string;
  rateLimiting: {
    enabled: boolean;
    defaultRequests: number;
    authRequests: number;
    windowMs: number;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    detailed: boolean;
  };
  cors: {
    origins: string[]; // ✅ FIJO: Array de strings específicos
  };
  features: {
    debugMode: boolean;
    testEndpoints: boolean;
  };
  security: {
    strictCORS: boolean;
  };
}

// Validar variables de entorno críticas
export function validateEnvironmentVariables(): void {
  const requiredVars = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY'
  ];

  const missingVars = requiredVars.filter(varName => !Deno.env.get(varName));
  
  if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:');
    missingVars.forEach(varName => console.error(`   - ${varName}`));
    console.error('\n💡 Copy .env.example to .env and fill in the values');
    Deno.exit(1);
  }
}

export const getEnvironmentConfig = (): EnvironmentConfig => {
  const NODE_ENV = Deno.env.get("NODE_ENV") || "development";
  
  switch (NODE_ENV) {
    case "production":
      return {
        name: "production",
        rateLimiting: {
          enabled: true,
          defaultRequests: 100,
          authRequests: 5,
          windowMs: 60 * 1000
        },
        logging: {
          level: "warn",
          detailed: false
        },
        cors: {
          // ✅ FIJO: Solo dominios específicos en producción
          origins: [
            "https://pedidolist.vercel.app",
            "https://www.pedidolist.com"
          ]
        },
        features: {
          debugMode: false,
          testEndpoints: false
        },
        security: {
          strictCORS: true
        }
      };
      
    case "staging":
      return {
        name: "staging",
        rateLimiting: {
          enabled: true,
          defaultRequests: 500,
          authRequests: 20,
          windowMs: 60 * 1000
        },
        logging: {
          level: "info",
          detailed: true
        },
        cors: {
          // ✅ Staging permite más orígenes para testing
          origins: [
            "http://localhost:3000", 
            "http://localhost:5173", 
            "https://pedidolist.vercel.app",
            "https://staging.pedidolist.vercel.app",
            "https://preview.pedidolist.vercel.app"
          ]
        },
        features: {
          debugMode: true,
          testEndpoints: true
        },
        security: {
          strictCORS: true
        }
      };
      
    default: // development
      return {
        name: "development",
        rateLimiting: {
          enabled: false, // ✅ Deshabilitado en desarrollo
          defaultRequests: 1000,
          authRequests: 100,
          windowMs: 60 * 1000
        },
        logging: {
          level: "debug",
          detailed: true
        },
        cors: {
          // ✅ Desarrollo permite localhost
          origins: [
            "http://localhost:3000",
            "http://localhost:5173",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:5173"
          ]
        },
        features: {
          debugMode: true,
          testEndpoints: true
        },
        security: {
          strictCORS: false // ✅ Más permisivo en desarrollo
        }
      };
  }
};

// Función helper para obtener configuración específica
export const getConfig = () => getEnvironmentConfig();

// Función para mostrar resumen de configuración
export const logEnvironmentConfig = () => {
  const config = getEnvironmentConfig();
  
  console.log(`\n📋 Environment Configuration:`);
  console.log(`   Environment: ${config.name}`);
  console.log(`   Rate Limiting: ${config.rateLimiting.enabled ? '✅' : '❌'}`);
  if (config.rateLimiting.enabled) {
    console.log(`     - Default: ${config.rateLimiting.defaultRequests} req/min`);
    console.log(`     - Auth: ${config.rateLimiting.authRequests} req/min`);
  }
  console.log(`   Logging Level: ${config.logging.level.toUpperCase()}`);
  console.log(`   Debug Mode: ${config.features.debugMode ? '✅' : '❌'}`);
  console.log(`   Test Endpoints: ${config.features.testEndpoints ? '✅' : '❌'}`);
  console.log(`   CORS Origins: ${config.cors.origins.length} configured`);
  console.log(`   Security: ${config.security.strictCORS ? '🛡️ Strict' : '⚠️ Permissive'}\n`);
}; 