/**
 * Recognising a store written before 0.2.0.
 *
 * The evidence identifiers changed once, in 0.2.0: the genesis anchor, the
 * head-signature domain and the event schema id all took a new prefix. A
 * store written before then cannot verify under this version (its seq 1 does
 * not link to the current genesis), and recording into it after an upgrade
 * signs new heads under the new domain, so no version verifies it any more.
 * There is no migration. The inspection commands (verify, ui, doctor, the
 * sink) say so in plain words instead of reporting a bare chain break. This
 * is never called on the record or hook paths, which fail open.
 */
import type { ChainRecord } from '../schema/events.js';
import type { EvidenceStore } from '../types.js';
/**
 * The schema value of a seq-1 record written in an earlier evidence format,
 * or undefined when `first` is not seq 1 or is in the current format. Both
 * signals must disagree: a seq 1 that links to the current genesis, or that
 * carries the current schema, is judged by the ordinary verifier.
 */
export declare function predatingSchema(first: ChainRecord | undefined): string | undefined;
/** {@link predatingSchema} for the seq 1 record of `store`. */
export declare function storePredatingSchema(store: EvidenceStore): string | undefined;
/** What the inspection commands print about a store written before 0.2.0. */
export declare function predatesMessage(schema: string, dataDir: string): string;
