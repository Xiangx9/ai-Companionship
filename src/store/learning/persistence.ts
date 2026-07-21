/**
 * Project list persistence, quota handling, export/import.
 */
import type { Ref } from 'vue'
import type { LearningProject } from '@/types/learning'
import { safeGetJson, safeSetJson, StorageQuotaError, downloadTextFile } from '@/utils/storage'
import {
  pruneProjectsData,
  needsSoftPrune,
  QUOTA_TOAST,
  type SlimLevel,
  type SlimProject,
} from '@/utils/storageSlim'
import { toastError, toastWarning } from '@/utils/toast'

export type PersistenceRefs = {
  projects: Ref<LearningProject[]>
  activeProjectId: Ref<string | null>
}

export function pruneProjectData(list: LearningProject[], level: SlimLevel = 'normal'): LearningProject[] {
  return pruneProjectsData(list as unknown as SlimProject[], level) as unknown as LearningProject[]
}

export function createPersistenceApi(refs: PersistenceRefs) {
  const { projects, activeProjectId } = refs

  function writeActiveId() {
    if (activeProjectId.value) {
      localStorage.setItem('aios_active_project', activeProjectId.value)
    } else {
      localStorage.removeItem('aios_active_project')
    }
  }

  function saveProjectsSnapshot(list: LearningProject[]) {
    projects.value = list
    safeSetJson('aios_projects', list)
    writeActiveId()
  }

  function tryEmergencyBackup(reason: string) {
    try {
      const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        reason,
        activeProjectId: activeProjectId.value,
        projects: projects.value,
      }
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      downloadTextFile(
        `ai-learning-os-emergency-${stamp}.json`,
        JSON.stringify(payload),
      )
    } catch {
      // ignore
    }
  }

  function init() {
    try {
      const raw = safeGetJson<LearningProject[]>('aios_projects', [])
      const valid = Array.isArray(raw)
        ? raw.filter((p) => p?.path?.modules && Array.isArray(p.path.modules))
        : []
      projects.value = pruneProjectData(valid, 'normal')
    } catch {
      projects.value = []
    }
    const savedActive = localStorage.getItem('aios_active_project')
    if (savedActive) activeProjectId.value = savedActive
  }

  function persist() {
    let level: SlimLevel = 'normal'
    let list = pruneProjectData(projects.value, level)

    if (needsSoftPrune(list)) {
      level = 'aggressive'
      list = pruneProjectData(projects.value, level)
    }

    try {
      saveProjectsSnapshot(list)
      return
    } catch (err) {
      if (!(err instanceof StorageQuotaError)) throw err
    }

    toastError(QUOTA_TOAST.full)
    tryEmergencyBackup('quota-exceeded')

    try {
      list = pruneProjectData(projects.value, 'aggressive')
      saveProjectsSnapshot(list)
      toastWarning(QUOTA_TOAST.compacted)
      return
    } catch (err) {
      if (!(err instanceof StorageQuotaError)) throw err
    }

    try {
      list = pruneProjectData(projects.value, 'critical')
      if (activeProjectId.value) {
        const active = list.find((p) => p.id === activeProjectId.value)
        const others = list.filter((p) => p.id !== activeProjectId.value)
        list = active ? [active, ...others].slice(0, 3) : list.slice(0, 3)
      }
      saveProjectsSnapshot(list)
      toastWarning(QUOTA_TOAST.critical)
    } catch {
      toastError(QUOTA_TOAST.failed)
    }
  }

  function exportBackup() {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      activeProjectId: activeProjectId.value,
      projects: projects.value,
    }
    return {
      fileName: `ai-learning-os-backup-${new Date().toISOString().slice(0, 10)}.json`,
      content: JSON.stringify(payload, null, 2),
    }
  }

  function importBackup(raw: string): { imported: number } {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new Error('备份文件不是合法 JSON')
    }

    const obj = parsed as { projects?: LearningProject[]; activeProjectId?: string | null }
    const list = Array.isArray(parsed)
      ? (parsed as LearningProject[])
      : Array.isArray(obj?.projects)
        ? obj.projects
        : null

    if (!list) throw new Error('备份中未找到 projects 数据')

    const valid = list.filter((p) => p?.id && p?.path?.modules && Array.isArray(p.path.modules))
    if (!valid.length) throw new Error('备份中没有可导入的有效项目')

    const map = new Map<string, LearningProject>()
    for (const p of projects.value) map.set(p.id, p)
    for (const p of valid) map.set(p.id, p)
    projects.value = pruneProjectData(
      [...map.values()].sort(
        (a, b) =>
          new Date(b.updatedAt || b.createdAt || 0).getTime() -
          new Date(a.updatedAt || a.createdAt || 0).getTime(),
      ),
    )

    if (obj && typeof obj === 'object' && 'activeProjectId' in obj) {
      const nextActive = obj.activeProjectId
      if (nextActive && projects.value.some((p) => p.id === nextActive)) {
        activeProjectId.value = nextActive
      }
    } else if (!activeProjectId.value && projects.value[0]) {
      activeProjectId.value = projects.value[0].id
    }

    persist()
    return { imported: valid.length }
  }

  return {
    init,
    persist,
    exportBackup,
    importBackup,
    pruneProjectData,
  }
}
