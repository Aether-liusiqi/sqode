/**
 * Virtual root of the worker host's in-memory filesystem. Kept
 * in one module so the process shim, the path/os shims, and the VFS image
 * collector cannot drift apart.
 */

/** Virtual filesystem root; `process.cwd()` and every absolute path start here. */
export const SQODE_ROOT = '/dsh'

/** `$SQODE_HOME`: durable-state directory inside the image. */
export const SQODE_HOME = `${SQODE_ROOT}/home`

/** Flat, symlink-free package tree resolved by the worker module loader. */
export const SQODE_NODE_MODULES = `${SQODE_ROOT}/node_modules`

/** Directory holding the composed cordis.yml. */
export const SQODE_CONFIG = `${SQODE_ROOT}/config`

/** Default (empty) workspace directory. */
export const SQODE_WORKSPACE = `${SQODE_ROOT}/workspace`

/** Temporary directory reported by `os.tmpdir()`. */
export const SQODE_TMP = `${SQODE_ROOT}/tmp`
