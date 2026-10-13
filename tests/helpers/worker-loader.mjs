import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:workers") return { url: new URL("./cloudflare.mjs", import.meta.url).href, shortCircuit: true };
  if (specifier.startsWith(".") && !/\.[a-z]+$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith(".ts")) return { format: "module", source: stripTypeScriptTypes(await readFile(new URL(url), "utf8")), shortCircuit: true };
  return nextLoad(url, context);
}
