/**
 * Unit tests for CLI program (command parsing).
 */

import { describe, it, expect } from 'vitest';
import { createProgram } from './program.js';

describe('CLI program', () => {
  it('should create a program with expected name', () => {
    const program = createProgram();
    expect(program.name()).toBe('ghostwork');
  });

  it('should have company subcommand', () => {
    const program = createProgram();
    const company = program.commands.find((c) => c.name() === 'company');
    expect(company).toBeDefined();

    const createCmd = company!.commands.find((c) => c.name() === 'create');
    expect(createCmd).toBeDefined();

    const listCmd = company!.commands.find((c) => c.name() === 'list');
    expect(listCmd).toBeDefined();
  });

  it('should have agent subcommand', () => {
    const program = createProgram();
    const agent = program.commands.find((c) => c.name() === 'agent');
    expect(agent).toBeDefined();

    const createCmd = agent!.commands.find((c) => c.name() === 'create');
    expect(createCmd).toBeDefined();

    const listCmd = agent!.commands.find((c) => c.name() === 'list');
    expect(listCmd).toBeDefined();
  });

  it('should have issue subcommand', () => {
    const program = createProgram();
    const issue = program.commands.find((c) => c.name() === 'issue');
    expect(issue).toBeDefined();
  });

  it('should have wakeup command', () => {
    const program = createProgram();
    const wakeup = program.commands.find((c) => c.name() === 'wakeup');
    expect(wakeup).toBeDefined();
  });

  it('should have runs subcommand', () => {
    const program = createProgram();
    const runs = program.commands.find((c) => c.name() === 'runs');
    expect(runs).toBeDefined();
  });

  it('should have logs subcommand with watch', () => {
    const program = createProgram();
    const logs = program.commands.find((c) => c.name() === 'logs');
    expect(logs).toBeDefined();

    const watch = logs!.commands.find((c) => c.name() === 'watch');
    expect(watch).toBeDefined();
  });
});
