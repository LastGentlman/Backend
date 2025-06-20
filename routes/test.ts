import { Hono } from "hono/mod.ts";

const app = new Hono();

app.get("/", (c) => {
  return c.json({ message: "This is the test route" });
});

export default app; 