#!/bin/bash

# 🚀 Setup Script para Load Testing con k6
# Este script instala k6 y configura el entorno para los tests de carga

set -e

echo "🚀 Configurando entorno para Load Testing..."

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Función para logging
log() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Detectar sistema operativo
detect_os() {
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if command -v apt-get &> /dev/null; then
            echo "ubuntu"
        elif command -v yum &> /dev/null; then
            echo "centos"
        else
            echo "linux"
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        echo "macos"
    elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
        echo "windows"
    else
        echo "unknown"
    fi
}

# Instalar k6 según el sistema operativo
install_k6() {
    local os=$(detect_os)
    
    log "Detectado sistema operativo: $os"
    
    case $os in
        "ubuntu"|"linux")
            log "Instalando k6 en Ubuntu/Linux..."
            sudo gpg -k
            sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
            echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
            sudo apt-get update
            sudo apt-get install -y k6
            ;;
        "macos")
            log "Instalando k6 en macOS..."
            if command -v brew &> /dev/null; then
                brew install k6
            else
                error "Homebrew no está instalado. Instala Homebrew primero: https://brew.sh/"
                exit 1
            fi
            ;;
        "windows")
            log "Instalando k6 en Windows..."
            if command -v choco &> /dev/null; then
                choco install k6
            else
                warn "Chocolatey no está instalado. Instala k6 manualmente desde: https://k6.io/docs/getting-started/installation/"
            fi
            ;;
        *)
            error "Sistema operativo no soportado: $os"
            warn "Instala k6 manualmente desde: https://k6.io/docs/getting-started/installation/"
            exit 1
            ;;
    esac
}

# Verificar instalación de k6
verify_k6() {
    if command -v k6 &> /dev/null; then
        local version=$(k6 version)
        log "✅ k6 instalado correctamente: $version"
    else
        error "❌ k6 no se pudo instalar correctamente"
        exit 1
    fi
}

# Crear archivo de configuración
create_config() {
    log "Creando archivo de configuración..."
    
    cat > .env.loadtest << EOF
# Configuración para Load Testing
# Modifica estos valores según tu entorno

# URL del servidor backend
BASE_URL=http://localhost:3030

# Token de autenticación (reemplaza con un token válido)
# TEST_TOKEN=tu_token_aqui

# Configuración de carga
MAX_VUS=20
DURATION=10m

# Thresholds
MAX_DURATION_MS=2000
MAX_ERROR_RATE=0.1
EOF

    log "✅ Archivo .env.loadtest creado"
    log "📝 Edita .env.loadtest para configurar tu entorno"
}

# Crear script de ejecución rápida
create_run_script() {
    log "Creando script de ejecución rápida..."
    
    cat > run-load-tests.sh << 'EOF'
#!/bin/bash

# 🚀 Script de ejecución rápida para Load Tests
# Uso: ./run-load-tests.sh [orders|monitoring|all]

set -e

# Cargar configuración
if [ -f .env.loadtest ]; then
    export $(cat .env.loadtest | grep -v '^#' | xargs)
fi

# Configuración por defecto
BASE_URL=${BASE_URL:-"http://localhost:3030"}
MAX_VUS=${MAX_VUS:-20}
DURATION=${DURATION:-"10m"}

echo "🚀 Iniciando Load Tests..."
echo "📡 URL: $BASE_URL"
echo "👥 VUs: $MAX_VUS"
echo "⏱️  Duración: $DURATION"

case "${1:-all}" in
    "orders")
        echo "📦 Ejecutando test de sincronización de órdenes..."
        k6 run --env BASE_URL="$BASE_URL" orders_sync_load.ts
        ;;
    "monitoring")
        echo "📊 Ejecutando test de monitoreo..."
        k6 run --env BASE_URL="$BASE_URL" monitoring_load.ts
        ;;
    "all")
        echo "📦 Ejecutando test de sincronización de órdenes..."
        k6 run --env BASE_URL="$BASE_URL" orders_sync_load.ts
        echo ""
        echo "📊 Ejecutando test de monitoreo..."
        k6 run --env BASE_URL="$BASE_URL" monitoring_load.ts
        ;;
    *)
        echo "❌ Uso: $0 [orders|monitoring|all]"
        exit 1
        ;;
esac

echo "✅ Load Tests completados"
EOF

    chmod +x run-load-tests.sh
    log "✅ Script run-load-tests.sh creado"
}

# Verificar que el servidor esté corriendo
check_server() {
    log "Verificando que el servidor esté corriendo..."
    
    local base_url=${BASE_URL:-"http://localhost:3030"}
    
    if curl -s "$base_url/health" > /dev/null; then
        log "✅ Servidor backend está corriendo en $base_url"
    else
        warn "⚠️  Servidor backend no está corriendo en $base_url"
        warn "💡 Inicia el servidor con: deno run --allow-all main.ts"
    fi
}

# Función principal
main() {
    echo -e "${BLUE}🚀 Setup para Load Testing con k6${NC}"
    echo "=================================="
    
    # Instalar k6
    install_k6
    verify_k6
    
    # Crear configuración
    create_config
    create_run_script
    
    # Verificar servidor
    check_server
    
    echo ""
    echo -e "${GREEN}✅ Setup completado exitosamente!${NC}"
    echo ""
    echo "📋 Próximos pasos:"
    echo "1. Edita .env.loadtest para configurar tu entorno"
    echo "2. Obtén un token válido y actualízalo en los scripts"
    echo "3. Ejecuta los tests: ./run-load-tests.sh [orders|monitoring|all]"
    echo ""
    echo "📚 Para más información, consulta README.md"
}

# Ejecutar función principal
main "$@" 