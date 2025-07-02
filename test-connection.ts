#!/usr/bin/env -S deno run --allow-all

import { load } from "https://deno.land/std@0.220.1/dotenv/mod.ts";
import { initializeSupabase, getSupabaseClient } from "./utils/supabase.ts";

// Colors for console output
const colors = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  reset: "\x1b[0m",
  bold: "\x1b[1m"
};

function log(message: string, color: keyof typeof colors = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testEnvironmentVariables() {
  log("\n🔧 Testing Environment Variables...", "blue");
  
  const requiredVars = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY'
  ];
  
  let allPresent = true;
  
  for (const varName of requiredVars) {
    const value = Deno.env.get(varName);
    if (value) {
      log(`✅ ${varName}: ${value.substring(0, 20)}...`, "green");
    } else {
      log(`❌ ${varName}: Missing`, "red");
      allPresent = false;
    }
  }
  
  return allPresent;
}

async function testSupabaseConnection() {
  log("\n🗄️ Testing Supabase Connection...", "blue");
  
  try {
    const supabase = getSupabaseClient();
    
    // Test basic connection
    const { data, error } = await supabase.from('profiles').select('count').limit(1);
    
    if (error) {
      log(`⚠️ Supabase connection warning: ${error.message}`, "yellow");
      return false;
    } else {
      log("✅ Supabase connection successful", "green");
      return true;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log(`❌ Supabase connection failed: ${errorMessage}`, "red");
    return false;
  }
}

async function testAPIServer() {
  log("\n🌐 Testing API Server...", "blue");
  
  const baseUrl = Deno.env.get("BACKEND_URL");
  const endpoints = [
    { name: "Root", path: "/" },
    { name: "Health", path: "/health" },
    { name: "Test Connection", path: "/api/test/test-connection" }
  ];
  
  let serverRunning = false;
  
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${baseUrl}${endpoint.path}`);
      const data = await response.json();
      
      log(`✅ ${endpoint.name}: ${response.status} ${response.statusText}`, "green");
      serverRunning = true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log(`❌ ${endpoint.name}: Connection failed - ${errorMessage}`, "red");
    }
  }
  
  return serverRunning;
}

async function testDatabaseTables() {
  log("\n📊 Testing Database Tables...", "blue");
  
  try {
    const supabase = getSupabaseClient();
    
    // Test common tables
    const tables = ['profiles', 'orders', 'businesses', 'employees'];
    let allTablesExist = true;
    
    for (const table of tables) {
      try {
        const { error } = await supabase.from(table).select('count').limit(1);
        
        if (error) {
          log(`❌ Table ${table}: ${error.message}`, "red");
          allTablesExist = false;
        } else {
          log(`✅ Table ${table}: Accessible`, "green");
        }
              } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          log(`❌ Table ${table}: ${errorMessage}`, "red");
          allTablesExist = false;
        }
    }
    
    return allTablesExist;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log(`❌ Database tables test failed: ${errorMessage}`, "red");
    return false;
  }
}

async function main() {
  log("🚀 Starting Backend Connection Tests", "bold");
  
  // Load environment variables
  try {
    const env = await load();
    for (const [key, value] of Object.entries(env)) {
      Deno.env.set(key, value);
    }
    log("✅ Environment variables loaded", "green");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log(`❌ Failed to load environment variables: ${errorMessage}`, "red");
    Deno.exit(1);
  }
  
  // Initialize Supabase
  try {
    initializeSupabase();
    log("✅ Supabase client initialized", "green");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log(`❌ Failed to initialize Supabase: ${errorMessage}`, "red");
    Deno.exit(1);
  }
  
  // Run tests
  const envTest = await testEnvironmentVariables();
  const supabaseTest = await testSupabaseConnection();
  const apiTest = await testAPIServer();
  const dbTest = await testDatabaseTables();
  
  // Summary
  log("\n📋 Test Summary", "bold");
  log(`Environment Variables: ${envTest ? "✅ PASS" : "❌ FAIL"}`, envTest ? "green" : "red");
  log(`Supabase Connection: ${supabaseTest ? "✅ PASS" : "❌ FAIL"}`, supabaseTest ? "green" : "red");
  log(`API Server: ${apiTest ? "✅ PASS" : "❌ FAIL"}`, apiTest ? "green" : "red");
  log(`Database Tables: ${dbTest ? "✅ PASS" : "❌ FAIL"}`, dbTest ? "green" : "red");
  
  const allPassed = envTest && supabaseTest && dbTest;
  
  if (allPassed) {
    log("\n🎉 All critical tests passed! Backend is ready.", "green");
  } else {
    log("\n⚠️ Some tests failed. Check the configuration.", "yellow");
  }
  
  // Note about API server
  if (!apiTest) {
    log("\n💡 Note: API server test failed. Make sure to run 'deno run --allow-all main.ts' to start the server.", "blue");
  }
}

if (import.meta.main) {
  main().catch((error) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log(`❌ Test runner failed: ${errorMessage}`, "red");
    Deno.exit(1);
  });
} 