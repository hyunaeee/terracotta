const port = process.env.PORT ?? "8080";

try {
  const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
    signal: AbortSignal.timeout(3_000),
  });
  if (!response.ok) process.exit(1);

  const health = await response.json();
  process.exit(health.status === "ok" && health.database === "ok" ? 0 : 1);
} catch {
  process.exit(1);
}
