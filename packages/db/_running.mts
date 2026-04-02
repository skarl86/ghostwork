import postgres from 'postgres';
const sql = postgres('postgresql://postgres:postgres@127.0.0.1:15432/ghostwork');
const runs = await sql`SELECT hr.id, hr.status, hr.pid, a.name, a.role, hr.task_id FROM heartbeat_runs hr JOIN agents a ON a.id = hr.agent_id WHERE hr.status IN ('running', 'queued') ORDER BY hr.created_at DESC LIMIT 10`;
console.log(`Running/queued runs: ${runs.length}`);
for (const r of runs) console.log(`  ${r.name}(${r.role}) status=${r.status} pid=${r.pid} task=${r.task_id?.slice(0,8)}`);
await sql.end();
