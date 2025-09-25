# Deno LTS Configuration

This project uses **Deno LTS version 2.2.14** for stability and long-term support.

## 🚀 Quick Setup

### 1. Install/Upgrade to Deno LTS
```bash
# Run the setup script
./scripts/setup-deno-lts.sh

# Or manually upgrade
deno upgrade --version 2.2.14
```

### 2. Verify Installation
```bash
deno --version
# Should show: deno 2.2.14
```

## 📋 Configuration

### deno.json
```json
{
  "denoVersion": "2.2.14",
  "compilerOptions": {
    "lib": ["deno.ns", "deno.window", "deno.unstable"]
  }
}
```

### Standard Library Versions
All std library imports use version `0.224.0` for compatibility with Deno LTS 2.2.14:

```typescript
import { load } from "https://deno.land/std@0.224.0/dotenv/mod.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
```

## 🛠️ Available Tasks

```bash
# Development
deno task dev          # Start development server with watch mode
deno task start        # Start production server
deno task test         # Run all tests
deno task lint         # Run linter
deno task fmt          # Format code
deno task check        # Type check
deno task build        # Cache dependencies
deno task upgrade      # Upgrade to LTS version
```

## 🔧 LTS Benefits

- **Stability**: Long-term support until October 31, 2025
- **Security**: Regular security patches and updates
- **Compatibility**: Guaranteed API stability
- **Performance**: Optimized runtime performance
- **Support**: Extended maintenance and support

## 📅 LTS Schedule

- **Current LTS**: Deno v2.2 (until October 31, 2025)
- **Next LTS**: Deno v2.3 (expected November 2025)

## 🚨 Important Notes

1. **Version Lock**: The project is locked to Deno LTS 2.2.14
2. **Std Library**: Use std@0.224.0 for compatibility
3. **Dependencies**: All dependencies are compatible with LTS
4. **Deployment**: Ensure deployment environments use the same LTS version

## 🔍 Troubleshooting

### Version Mismatch
```bash
# Check current version
deno --version

# Upgrade to LTS
deno upgrade --version 2.2.14
```

### Cache Issues
```bash
# Clear cache and reinstall
deno cache --reload main.ts
```

### Type Check Errors
```bash
# Run type check
deno check main.ts

# Check for std library version mismatches
grep -r "deno.land/std@" . --exclude-dir=node_modules
```

## 📚 Resources

- [Deno LTS Documentation](https://docs.deno.com/runtime/fundamentals/stability_and_releases/)
- [Deno Standard Library](https://deno.land/std@0.224.0)
- [Deno Upgrade Guide](https://docs.deno.com/runtime/manual/upgrading_deno)
