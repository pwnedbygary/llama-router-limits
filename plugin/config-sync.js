import { constants } from "node:fs"
import { copyFile, readFile, rename, stat, unlink, writeFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"

import jsonc from "jsonc-parser"

const { applyEdits, modify, parse } = jsonc

/** Update only configured models whose upstream ID is present in the router. */
export async function syncConfigFile(configPath, providerID, limitsByRouterID) {
  const original = await readFile(configPath, "utf8")
  const errors = []
  const config = parse(original, errors, { allowTrailingComma: true })
  if (errors.length > 0 || !config || typeof config !== "object") {
    throw new Error(`invalid OpenCode JSONC config at ${configPath}`)
  }

  const root = config.provider?.[providerID] ? "provider"
    : config.providers?.[providerID] ? "providers"
      : undefined
  if (!root) throw new Error(`provider ${providerID} not found in ${configPath}`)

  const models = config[root][providerID]?.models
  if (!models || typeof models !== "object") return { changed: 0, models: 0 }

  let updated = original
  let changed = 0
  let matched = 0
  for (const [modelKey, modelConfig] of Object.entries(models)) {
    if (!modelConfig || typeof modelConfig !== "object") continue
    const remoteID = modelConfig.modelID ?? modelConfig.api?.id ?? modelKey
    const limits = limitsByRouterID.get(String(remoteID))
    if (!limits) continue
    matched += 1

    for (const field of ["context", "output"]) {
      const value = limits[field]
      if (value === undefined || modelConfig.limit?.[field] === value) continue
      const edits = modify(
        updated,
        [root, providerID, "models", modelKey, "limit", field],
        value,
        { formattingOptions: { insertSpaces: true, tabSize: 2, eol: "\n" } },
      )
      updated = applyEdits(updated, edits)
      changed += 1
    }
  }

  if (changed === 0) return { changed: 0, models: matched }

  if (await readFile(configPath, "utf8") !== original) {
    throw new Error("OpenCode config changed during refresh; will retry later")
  }

  const mode = (await stat(configPath)).mode & 0o777
  const suffix = `${Date.now()}-${randomUUID()}`
  const backup = `${configPath}.bak.llama-router-limits.${suffix}`
  const temporary = `${configPath}.tmp.llama-router-limits.${suffix}`
  await copyFile(configPath, backup, constants.COPYFILE_EXCL)

  try {
    await writeFile(temporary, updated, { encoding: "utf8", mode, flag: "wx" })
    if (await readFile(configPath, "utf8") !== original) {
      throw new Error("OpenCode config changed before replacement; will retry later")
    }
    await rename(temporary, configPath)
  } catch (error) {
    await unlink(temporary).catch(() => {})
    throw error
  }

  return { changed, models: matched, backup }
}
