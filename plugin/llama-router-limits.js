import { homedir } from "node:os"
import { join } from "node:path"

import { syncConfigFile } from "./config-sync.js"

const DEFAULTS = Object.freeze({
  providerID: "llama-cpp-router",
  routerURL: "http://127.0.0.1:8080/models?reload=1",
  refreshIntervalMs: 30_000,
  requestTimeoutMs: 5_000,
})

const PREFIX = "[llama-router-limits]"

function positiveInteger(value) {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined
}

/** Read only the resolved llama.cpp limit arguments. */
export function limitsFromArgs(args) {
  if (!Array.isArray(args)) return {}

  const result = {}
  const fields = new Map([
    ["--ctx-size", "context"],
    ["--n-predict", "output"],
  ])

  for (let index = 0; index < args.length; index += 1) {
    const raw = String(args[index])
    const equalAt = raw.indexOf("=")
    const flag = equalAt === -1 ? raw : raw.slice(0, equalAt)
    const field = fields.get(flag)
    if (!field) continue

    const candidate = equalAt === -1 ? args[index + 1] : raw.slice(equalAt + 1)
    const value = positiveInteger(candidate)
    if (value !== undefined) result[field] = value
  }

  return result
}

export function limitsFromRouterPayload(payload) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.data)) {
    throw new TypeError("router response must contain a data array")
  }

  const limits = new Map()
  for (const item of payload.data) {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || !item.id) continue
    const parsed = limitsFromArgs(item.status?.args)
    if (parsed.context !== undefined || parsed.output !== undefined) {
      limits.set(item.id, parsed)
    }
  }
  return limits
}

export async function fetchRouterLimits(routerURL, timeoutMs, fetchImplementation = fetch) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchImplementation(routerURL, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`router returned HTTP ${response.status}`)

    const limits = limitsFromRouterPayload(await response.json())
    if (limits.size === 0) throw new Error("router returned no models with valid limits")
    return limits
  } finally {
    clearTimeout(timeout)
  }
}

function stringOption(options, key, environmentName, fallback) {
  const fromOptions = options?.[key]
  if (typeof fromOptions === "string" && fromOptions.trim()) return fromOptions.trim()
  const fromEnvironment = process.env[environmentName]
  return typeof fromEnvironment === "string" && fromEnvironment.trim()
    ? fromEnvironment.trim()
    : fallback
}

function numberOption(options, key, environmentName, fallback, minimum) {
  const fromOptions = positiveInteger(options?.[key])
  if (fromOptions !== undefined && fromOptions >= minimum) return fromOptions
  const fromEnvironment = positiveInteger(process.env[environmentName])
  if (fromEnvironment !== undefined && fromEnvironment >= minimum) return fromEnvironment
  return fallback
}

function defaultConfigPath() {
  const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), ".config")
  return join(configHome, "opencode", "opencode.jsonc")
}

/** @type {import("@opencode/plugin").Plugin.Plugin} */
const plugin = {
  id: "llama-router-limits",

  async setup(ctx) {
    const providerID = stringOption(
      ctx.options, "providerID", "OPENCODE_LLAMA_ROUTER_PROVIDER_ID", DEFAULTS.providerID,
    )
    const routerURL = stringOption(
      ctx.options, "routerURL", "OPENCODE_LLAMA_ROUTER_URL", DEFAULTS.routerURL,
    )
    const configPath = stringOption(
      ctx.options, "configPath", "OPENCODE_LLAMA_ROUTER_CONFIG_PATH", defaultConfigPath(),
    )
    const refreshIntervalMs = numberOption(
      ctx.options, "refreshIntervalMs", "OPENCODE_LLAMA_ROUTER_REFRESH_MS",
      DEFAULTS.refreshIntervalMs, 10_000,
    )
    const requestTimeoutMs = numberOption(
      ctx.options, "requestTimeoutMs", "OPENCODE_LLAMA_ROUTER_TIMEOUT_MS",
      DEFAULTS.requestTimeoutMs, 250,
    )

    let stopped = false
    let refreshing = false

    const refresh = async () => {
      if (stopped || refreshing) return
      refreshing = true
      try {
        const limits = await fetchRouterLimits(routerURL, requestTimeoutMs)
        if (stopped) return
        const result = await syncConfigFile(configPath, providerID, limits)
        if (result.changed > 0) {
          console.info(`${PREFIX} updated ${result.changed} limit value(s) for ${result.models} model(s); backup: ${result.backup}`)
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        console.warn(`${PREFIX} refresh skipped; existing config retained: ${reason}`)
      } finally {
        refreshing = false
      }
    }

    await refresh()
    const timer = setInterval(() => void refresh(), refreshIntervalMs)

    return () => {
      stopped = true
      clearInterval(timer)
    }
  },
}

export default plugin
