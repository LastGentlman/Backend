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
    level: '🔍🐛' | 'ℹ️' | '⚠️' | '‼️ Error 🚨';
    detailed: boolean;
  };
  cors: {
    origins: string[];
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
          defaultRequests: 100, // Estricto
          authRequests: 5,      // Muy estricto
          windowMs: 60 * 1000   // 1 minuto
        },
        logging: {
          level: "⚠️",
          detailed: false
        },
        cors: {
          origins: ["https://pedidolist.vercel.app"] // Solo producción
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
          defaultRequests: 500, // Más permisivo que producción
          authRequests: 20,     // Más permisivo que producción
          windowMs: 60 * 1000   // 1 minuto
        },
        logging: {
          level: "ℹ️",
          detailed: true
        },
        cors: {
          origins: [
            "http://localhost:3000", 
            "http://localhost:5173", 
            "https://pedidolist.vercel.app",
            "https://7f73-2605-59c8-7014-d610-cea7-c4a4-75db-d545.ngrok-free.app",
            "https://staging.pedidolist.vercel.app" // URL de staging
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
          enabled: false,
          defaultRequests: 0,
          authRequests: 0,
          windowMs: 0
        },
        logging: {
          level: "🔍🐛",
          detailed: true
        },
        cors: {
          origins: [
            "http://localhost:3030", 
            "http://localhost:5173",
            "http://localhost:3000",
            "https://pedidolist.vercel.app"
          ]
        },
        features: {
          debugMode: true,
          testEndpoints: true
        },
        security: {
          strictCORS: false
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
    console.log(`     - Auth: ${config.rateLimiting.authRequests} req/15min`);
  }
  console.log(`   Logging Level: ${config.logging.level}`);
  console.log(`   Debug Mode: ${config.features.debugMode ? '✅' : '❌'}`);
  console.log(`   Test Endpoints: ${config.features.testEndpoints ? '✅' : '❌'}`);
  console.log(`   CORS Origins: ${config.cors.origins.length} configured`);
  console.log(`   Security: ${config.security.strictCORS ? '🛡️ Strict' : '⚠️ Permissive'}\n`);
}; 