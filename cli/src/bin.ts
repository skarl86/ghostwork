#!/usr/bin/env node
/**
 * CLI binary entry point.
 */

import { createProgram } from './program.js';

const program = createProgram();
program.parse(process.argv);
