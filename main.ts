import { Hono } from "hono";
import { load } from "https://deno.land/std@0.220.1/dotenv/mod.ts";
import testRoutes from "./routes/test.ts";

// Load environment variables from .env file
const env = await load();
console.log("Loaded .env file:", env);

// Set environment variables for Deno
for (const [key, value] of Object.entries(env)) {
  Deno.env.set(key, value);
}

const app = new Hono();

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

// Add test routes
app.route("/api", testRoutes);

// Start the server on port 3000
console.log("Starting server on http://localhost:3000");
Deno.serve({ port: 3000 }, app.fetch); 