import { test } from "node:test";
import assert from "node:assert/strict";
import { messages, resolveLang, translate, translateError } from "./i18n.ts";

test("English and Spanish define exactly the same keys, none empty", () => {
  const en = Object.keys(messages.en).sort();
  const es = Object.keys(messages.es).sort();
  assert.deepEqual(es, en);
  for (const lang of ["en", "es"] as const) {
    for (const [key, value] of Object.entries(messages[lang])) assert.ok(value.trim(), `${lang}.${key} is empty`);
  }
});

test("every placeholder used in English exists in Spanish", () => {
  const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const key of Object.keys(messages.en) as (keyof typeof messages.en)[]) {
    assert.deepEqual(params(messages.es[key]), params(messages.en[key]), key);
  }
});

test("translate interpolates parameters", () => {
  assert.equal(translate("es", "filters.loadN", { count: 3 }), "Cargar 3 en Cherry-pick");
  assert.equal(translate("en", "filters.loadN", { count: 3 }), "Load 3 into Cherry-pick");
});

test("auto follows the OS language and falls back to English", () => {
  assert.equal(resolveLang("auto", "es-AR"), "es");
  assert.equal(resolveLang("auto", "en-US"), "en");
  assert.equal(resolveLang("auto", "pt-BR"), "en");
  assert.equal(resolveLang("es", "en-US"), "es");
  assert.equal(resolveLang("en", "es-ES"), "en");
});

test("known backend errors are translated and git output is kept verbatim", () => {
  assert.equal(translateError("es", "branch 'cp/x' already exists on the remote"), "La rama 'cp/x' ya existe en el remoto");
  assert.equal(translateError("es", "unresolved conflict markers in: a.txt, b.txt"), "Quedan marcadores de conflicto sin resolver en: a.txt, b.txt");
  assert.equal(
    translateError("es", "git push -u origin x failed: fatal: Authentication failed"),
    "git push -u origin x falló: fatal: Authentication failed",
  );
  assert.equal(translateError("es", "something new"), "something new");
  assert.equal(translateError("en", "branch 'cp/x' already exists"), "branch 'cp/x' already exists");
});
