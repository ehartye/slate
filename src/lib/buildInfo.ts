import { getBuildInfo, type BuildInfo } from './tauri'

export const unknownBuildInfo: BuildInfo = {
  version: 'Unknown', commit: null, trackedState: 'unknown',
}

export async function loadBuildInfo(): Promise<BuildInfo> {
  try {
    return await getBuildInfo()
  } catch {
    return { ...unknownBuildInfo }
  }
}

export const trackedStateLabel = (state: BuildInfo['trackedState']) =>
  ({ clean: 'Clean', modified: 'Modified', unknown: 'Unknown' })[state]

export function formatBuildInfo(info: BuildInfo): string {
  return `Slate: ${info.version}\nCommit: ${info.commit ?? 'Unknown'}\nTracked changes: ${trackedStateLabel(info.trackedState)}`
}

export async function copyBuildInfo(info: BuildInfo): Promise<string> {
  try {
    await navigator.clipboard.writeText(formatBuildInfo(info))
    return 'Build info copied.'
  } catch {
    return 'Could not copy. Select the information above and copy it manually.'
  }
}
