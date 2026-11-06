/** Dependency-free IPC names shared with the sandboxed mandatory-update preload. */
export const MANDATORY_IPC = {
  status: 'sqh-desktop:mandatory-status', state: 'sqh-desktop:mandatory-state', action: 'sqh-desktop:mandatory-action',
} as const
