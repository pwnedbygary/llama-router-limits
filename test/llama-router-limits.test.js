import assert from "node:assert/strict"
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import jsonc from "jsonc-parser"

import plugin, {
  fetchRouterLimits,
  limitsFromArgs,
  limitsFromRouterPayload,
} from "../plugin/llama-router-limits.js"
import { syncConfigFile } from "../plugin/config-sync.js"

const fixture = JSON.parse(
  await readFile(new URL("./fixtures/models.json", import.meta.url), "utf8"),
)

test("extracts the five observed router model limits", () => {
  assert.deepEqual(Object.fromEntries(limitsFromRouterPayload(fixture)), {
    "CYBER-TIEL-CODER-35B-A3B-Q4_K_XL": { context: 163840, output: 32768 },
    "Dirk-3.8-27B-IQ3_XXS-MTP": { context: 163840, output: 32768 },
    "Qwen3.8-27B-GSQ-RCO-IQ3_S-MTP": { context: 98304, output: 32768 },
    "Qwen3.8-27B-GSQ-RCO-IQ3_XXS-MTP": { context: 163840, output: 32768 },
    "TIEL-CODER-35B-A3B-Q4_K_XL": { context: 163840, output: 32768 },
  })
})

test("accepts equals syntax and ignores invalid sizes", () => {
  assert.deepEqual(limitsFromArgs(["--ctx-size=131072", "--n-predict", "8192"]), {
    context: 131072,
    output: 8192,
  })
  assert.deepEqual(
    limitsFromArgs(["--ctx-size", "0", "--n-predict=-1", "--ctx-size=1.5"]),
    {},
  )
})

test("rejects malformed router payloads and empty valid snapshots", async () => {
  assert.throws(() => limitsFromRouterPayload({ data: {} }), /data array/)
  await assert.rejects(
    fetchRouterLimits("http://router.invalid/models", 1000, async () => ({
      ok: true,
      json: async () => ({ data: [{ id: "missing-args", status: {} }] }),
    })),
    /no models with valid limits/,
  )
})

test("edits only matched limit values and preserves comments and other metadata", async () => {
  const directory = await mkdtemp(join(tmpdir(), "llama-router-limits-test-"))
  const configPath = join(directory, "opencode.jsonc")
  const original = `{
  // Keep this user comment.
  "provider": {
    "llama-cpp-router": {
      "name": "Local router",
      "models": {
        "alias": {
          "modelID": "TIEL-CODER-35B-A3B-Q4_K_XL",
          "name": "Tiel Coder",
          "modalities": { "input": ["text", "image"] },
          "limit": { "context": 65536, "input": 60000, "output": 4096 }
        },
        "untouched": {
          "name": "Other model",
          "limit": { "context": 8000, "output": 1000 }
        }
      }
    },
    "another-provider": { "models": { "alias": { "limit": { "context": 1, "output": 2 } } } }
  }
}`
  await writeFile(configPath, original)

  const limits = new Map([
    ["TIEL-CODER-35B-A3B-Q4_K_XL", { context: 163840, output: 32768 }],
  ])
  const result = await syncConfigFile(configPath, "llama-cpp-router", limits)
  const changed = await readFile(configPath, "utf8")
  const parsed = jsonc.parse(changed)

  assert.equal(result.changed, 2)
  assert.equal(result.models, 1)
  assert.equal(await readFile(result.backup, "utf8"), original)
  assert.match(changed, /\/\/ Keep this user comment\./)
  assert.deepEqual(parsed.provider["llama-cpp-router"].models.alias, {
    modelID: "TIEL-CODER-35B-A3B-Q4_K_XL",
    name: "Tiel Coder",
    modalities: { input: ["text", "image"] },
    limit: { context: 163840, input: 60000, output: 32768 },
  })
  assert.deepEqual(parsed.provider["llama-cpp-router"].models.untouched.limit, {
    context: 8000, output: 1000,
  })
  assert.deepEqual(parsed.provider["another-provider"].models.alias.limit, {
    context: 1, output: 2,
  })

  assert.deepEqual(await syncConfigFile(configPath, "llama-cpp-router", limits), {
    changed: 0, models: 1,
  })
  assert.equal((await readdir(directory)).filter((name) => name.includes(".bak.")).length, 1)
})

test("missing router fields leave the corresponding configured limit alone", async () => {
  const directory = await mkdtemp(join(tmpdir(), "llama-router-limits-test-"))
  const configPath = join(directory, "opencode.jsonc")
  await writeFile(configPath, JSON.stringify({
    provider: { "llama-cpp-router": { models: { model: {
      limit: { context: 1000, output: 200 },
    } } } },
  }))

  await syncConfigFile(configPath, "llama-cpp-router", new Map([
    ["model", { context: 2000 }],
  ]))
  const parsed = JSON.parse(await readFile(configPath, "utf8"))
  assert.deepEqual(parsed.provider["llama-cpp-router"].models.model.limit, {
    context: 2000, output: 200,
  })
})

test("an explicit upstream ID never falls back to a matching local key", async () => {
  const directory = await mkdtemp(join(tmpdir(), "llama-router-limits-test-"))
  const configPath = join(directory, "opencode.jsonc")
  const original = JSON.stringify({
    provider: { "llama-cpp-router": { models: {
      "TIEL-CODER-35B-A3B-Q4_K_XL": {
        modelID: "different-upstream-model",
        limit: { context: 65536, output: 4096 },
      },
      "CYBER-TIEL-CODER-35B-A3B-Q4_K_XL": {
        api: { id: "another-upstream-model" },
        limit: { context: 65536, output: 4096 },
      },
    } } },
  })
  await writeFile(configPath, original)

  const result = await syncConfigFile(configPath, "llama-cpp-router", new Map([
    ["TIEL-CODER-35B-A3B-Q4_K_XL", { context: 163840, output: 32768 }],
    ["CYBER-TIEL-CODER-35B-A3B-Q4_K_XL", { context: 163840, output: 32768 }],
  ]))
  assert.deepEqual(result, { changed: 0, models: 0 })
  assert.equal(await readFile(configPath, "utf8"), original)
  assert.equal((await readdir(directory)).filter((name) => name.includes(".bak.")).length, 0)
})

test("V2 setup synchronizes on startup and keeps config when router is offline", async () => {
  const directory = await mkdtemp(join(tmpdir(), "llama-router-limits-test-"))
  const configPath = join(directory, "opencode.jsonc")
  const original = JSON.stringify({
    provider: { "llama-cpp-router": { models: {
      "Qwen3.8-27B-GSQ-RCO-IQ3_S-MTP": {
        limit: { context: 65536, output: 4096 },
      },
    } } },
  })
  await writeFile(configPath, original)
  const originalFetch = globalThis.fetch
  const originalSetInterval = globalThis.setInterval
  const scheduledIntervals = []

  try {
    globalThis.setInterval = (callback, delay) => {
      scheduledIntervals.push(delay)
      return originalSetInterval(callback, delay)
    }
    globalThis.fetch = async () => new Response(JSON.stringify(fixture), { status: 200 })
    const cleanup = await plugin.setup({ options: { configPath } })
    assert.deepEqual(
      JSON.parse(await readFile(configPath, "utf8")).provider["llama-cpp-router"]
        .models["Qwen3.8-27B-GSQ-RCO-IQ3_S-MTP"].limit,
      { context: 98304, output: 32768 },
    )
    cleanup()

    await writeFile(configPath, original)
    globalThis.fetch = async () => { throw new Error("offline") }
    const offlineCleanup = await plugin.setup({ options: { configPath } })
    assert.equal(await readFile(configPath, "utf8"), original)
    offlineCleanup()
    assert.deepEqual(scheduledIntervals, [30_000, 30_000])
  } finally {
    globalThis.fetch = originalFetch
    globalThis.setInterval = originalSetInterval
  }
})
