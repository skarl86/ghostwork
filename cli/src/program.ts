/**
 * CLI program definition — uses Commander.js.
 */

import { Command } from 'commander';
import { CLI_VERSION } from './index.js';
import { loadCliConfig } from './config.js';
import { createApiClient, ApiClientError } from './api-client.js';
import WebSocket from 'ws';

function handleError(err: unknown): never {
  if (err instanceof ApiClientError) {
    console.error(`Error: ${err.message}`);
  } else if (err instanceof Error) {
    console.error(`Error: ${err.message}`);
  } else {
    console.error('Unknown error:', err);
  }
  process.exit(1);
}

export function createProgram(): Command {
  const config = loadCliConfig();
  const api = createApiClient(config);

  const program = new Command();
  program
    .name('ghostwork')
    .description('Ghostwork agent orchestration CLI')
    .version(CLI_VERSION);

  // ── Company Commands ──

  const company = program
    .command('company')
    .description('Manage companies');

  company
    .command('create')
    .description('Create a new company')
    .requiredOption('--name <name>', 'Company name')
    .option('--description <desc>', 'Company description')
    .action(async (opts: { name: string; description?: string }) => {
      try {
        const result = await api.createCompany(opts.name, opts.description);
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        handleError(err);
      }
    });

  company
    .command('list')
    .description('List all companies')
    .action(async () => {
      try {
        const items = await api.listCompanies();
        console.log(JSON.stringify(items, null, 2));
      } catch (err) {
        handleError(err);
      }
    });

  company
    .command('export')
    .description('Export a company to JSON')
    .requiredOption('--id <companyId>', 'Company ID')
    .option('--output <file>', 'Output file path')
    .action(async (opts: { id: string; output?: string }) => {
      try {
        const result = await api.exportCompany(opts.id);
        const json = JSON.stringify(result, null, 2);
        if (opts.output) {
          const { writeFileSync } = await import('node:fs');
          writeFileSync(opts.output, json, 'utf-8');
          console.log(`Exported to ${opts.output}`);
        } else {
          console.log(json);
        }
      } catch (err) {
        handleError(err);
      }
    });

  company
    .command('import')
    .description('Import a company from JSON')
    .requiredOption('--file <path>', 'Input file path')
    .option('--strategy <strategy>', 'Conflict strategy: rename or skip', 'rename')
    .action(async (opts: { file: string; strategy: string }) => {
      try {
        const { readFileSync } = await import('node:fs');
        const raw = readFileSync(opts.file, 'utf-8');
        const data = JSON.parse(raw);
        const result = await api.importCompany(data, opts.strategy);
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        handleError(err);
      }
    });

  // ── Agent Commands ──

  const agent = program.command('agent').description('Manage agents');

  agent
    .command('create')
    .description('Create a new agent')
    .requiredOption('--company <id>', 'Company ID')
    .requiredOption('--name <name>', 'Agent name')
    .requiredOption('--adapter <type>', 'Adapter type (e.g. process, claude-local)')
    .action(
      async (opts: { company: string; name: string; adapter: string }) => {
        try {
          const result = await api.createAgent(
            opts.company,
            opts.name,
            opts.adapter,
          );
          console.log(JSON.stringify(result, null, 2));
        } catch (err) {
          handleError(err);
        }
      },
    );

  agent
    .command('list')
    .description('List agents')
    .requiredOption('--company <id>', 'Company ID')
    .action(async (opts: { company: string }) => {
      try {
        const items = await api.listAgents(opts.company);
        console.log(JSON.stringify(items, null, 2));
      } catch (err) {
        handleError(err);
      }
    });

  // ── Issue Commands ──

  const issue = program.command('issue').description('Manage issues');

  issue
    .command('create')
    .description('Create a new issue')
    .requiredOption('--company <id>', 'Company ID')
    .requiredOption('--title <title>', 'Issue title')
    .option('--assignee <agentId>', 'Assignee agent ID')
    .action(
      async (opts: { company: string; title: string; assignee?: string }) => {
        try {
          const result = await api.createIssue(
            opts.company,
            opts.title,
            opts.assignee,
          );
          console.log(JSON.stringify(result, null, 2));
        } catch (err) {
          handleError(err);
        }
      },
    );

  issue
    .command('list')
    .description('List issues')
    .requiredOption('--company <id>', 'Company ID')
    .action(async (opts: { company: string }) => {
      try {
        const items = await api.listIssues(opts.company);
        console.log(JSON.stringify(items, null, 2));
      } catch (err) {
        handleError(err);
      }
    });

  // ── Wakeup Command ──

  program
    .command('wakeup')
    .description('Manually trigger agent wakeup')
    .requiredOption('--company <id>', 'Company ID')
    .requiredOption('--agent <id>', 'Agent ID')
    .action(async (opts: { company: string; agent: string }) => {
      try {
        const result = await api.wakeup(opts.company, opts.agent);
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        handleError(err);
      }
    });

  // ── Runs Commands ──

  const runs = program.command('runs').description('Manage heartbeat runs');

  runs
    .command('list')
    .description('List runs')
    .requiredOption('--company <id>', 'Company ID')
    .action(async (opts: { company: string }) => {
      try {
        const items = await api.listRuns(opts.company);
        console.log(JSON.stringify(items, null, 2));
      } catch (err) {
        handleError(err);
      }
    });

  // ── Logs Commands ──

  const logs = program.command('logs').description('Real-time log streaming');

  logs
    .command('watch')
    .description('Watch real-time events via WebSocket')
    .requiredOption('--company <id>', 'Company ID')
    .action((opts: { company: string }) => {
      const wsUrl = config.apiUrl
        .replace(/^http/, 'ws')
        .concat(`/api/companies/${opts.company}/events/ws`);

      console.log(`Connecting to ${wsUrl}...`);
      const ws = new WebSocket(wsUrl);

      ws.on('open', () => {
        console.log('Connected. Watching for events... (Ctrl+C to quit)');
      });

      ws.on('message', (data: WebSocket.RawData) => {
        try {
          const event = JSON.parse(data.toString());
          const ts = (event as { timestamp?: string }).timestamp ?? '';
          const type = (event as { type?: string }).type ?? 'unknown';
          console.log(`[${ts}] ${type}:`, JSON.stringify((event as { payload?: unknown }).payload));
        } catch {
          console.log(data.toString());
        }
      });

      ws.on('close', (code: number, reason: Buffer) => {
        console.log(`Disconnected (code=${code}, reason=${reason.toString()})`);
        process.exit(0);
      });

      ws.on('error', (err: Error) => {
        console.error('WebSocket error:', err.message);
        process.exit(1);
      });
    });

  return program;
}
