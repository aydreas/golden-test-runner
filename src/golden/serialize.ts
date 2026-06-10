import { Document, type Scalar } from 'yaml';
import type { Golden } from '../spec/types.js';

/** Serialize a golden scenario to YAML. */
export function serializeGolden(golden: Golden): string {
  const doc = new Document(golden);

  // Quote generatedAt so YAML 1.1 consumers (editors/schema validators) read it
  // as a string rather than coercing the bare ISO timestamp to a date.
  const generatedAt = doc.get('generatedAt', true) as Scalar | undefined;
  if (generatedAt) generatedAt.type = 'QUOTE_DOUBLE';

  return doc.toString({
    lineWidth: 0, // don't wrap long scalars (queries, urls)
    blockQuote: 'literal',
  });
}