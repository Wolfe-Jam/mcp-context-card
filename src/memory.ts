/**
 * memory — real, file-backed remember/recall against a `.fafm` file.
 *
 * No in-memory cache, no side-file: every call reads/writes the `.fafm`
 * from disk via a structural YAML edit (comments + layout preserved).
 * That's the actual claim `.fafm` makes ("memory that survives across
 * sessions") — proven by demo.ts / the test suite restarting the server
 * process between remember() and recall() and getting the same fact back.
 *
 * Thin re-export: the parse/read/write logic lives in ./faf/parse-fafm.
 */
export { recall, remember, forget, parseFafm } from "./faf/parse-fafm.js";
export type { Memory, MemoryFact } from "./faf/types.js";
