import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

import { fetchRouterLimits, limitsFromRouterPayload } from "../plugin/llama-router-limits.js"

const routerURL = process.env.OPENCODE_LLAMA_ROUTER_URL ??
  "http://127.0.0.1:8080/models?reload=1"
const fixture = JSON.parse(
  await readFile(new URL("./fixtures/models.json", import.meta.url), "utf8"),
)
const expected = limitsFromRouterPayload(fixture)
const actual = await fetchRouterLimits(routerURL, 5_000)

for (const [modelID, expectedLimits] of expected) {
  assert.deepEqual(
    actual.get(modelID),
    expectedLimits,
    `live router limits changed for ${modelID}`,
  )
}

console.log(`Live router check passed for ${expected.size} model(s) at ${routerURL}`)
