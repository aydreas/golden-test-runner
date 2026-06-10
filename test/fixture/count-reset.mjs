// Test helper used as a reset `command`: records each invocation so tests can
// count how many times the reset hook ran.
import { appendFileSync } from 'node:fs';
appendFileSync(process.env.GTR_RESET_COUNT, 'x');
