#!/usr/bin/env node
import { sweepStaleDiagnosesHandler } from '../index.js';

/**
 * Run the sweep against whatever DATABASE_URL points at.
 *
 * The same handler a schedule would invoke, runnable by hand — which is how it
 * runs today, there being no scheduler deployed yet.
 */
const result = await sweepStaleDiagnosesHandler();
console.log(JSON.stringify(result));
process.exit(result.failed > 0 ? 1 : 0);
