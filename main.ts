import { Hono } from "hono/mod.ts";
import { cors } from "hono/cors.ts";
import test from "./routes/test.ts";

const app = new Hono();

// Apply CORS middleware
app.use("*", cors());

// Register routes
app.route("/test", test);

app.get("/", (c) => {
  return c.text("Hello, World!");
});

Deno.serve(app.fetch); 