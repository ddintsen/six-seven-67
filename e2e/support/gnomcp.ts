// Test-only bridge to a gnomcp process that signs with the local dev chain's
// built-in test1 key. It lets an injected Adena stand-in broadcast real
// transactions to a local gnoland node. Never used against a shared network.
import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';

export class GnoMcp {
  private child: ChildProcessWithoutNullStreams;
  private buffer = '';
  private waiting = new Map<number, (message: { result?: { content?: { text?: string }[]; isError?: boolean; structuredContent?: Record<string, unknown> }; error?: unknown }) => void>();
  private nextId = 0;
  constructor(binary: string) {
    this.child = spawn(binary, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.stdout.on('data', chunk => {
      this.buffer += chunk;
      let index;
      while ((index = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, index); this.buffer = this.buffer.slice(index + 1);
        if (!line.trim()) continue;
        const message = JSON.parse(line);
        this.waiting.get(message.id)?.(message); this.waiting.delete(message.id);
      }
    });
  }
  private request(method: string, params: unknown) {
    return new Promise<Parameters<NonNullable<ReturnType<typeof this.waiting.get>>>[0]>(resolve => {
      const id = ++this.nextId; this.waiting.set(id, resolve);
      this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }
  async init() {
    await this.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: '67-e2e', version: '1' } });
    this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  }
  async tool(name: string, args: Record<string, unknown>) {
    const response = await this.request('tools/call', { name, arguments: args });
    return { text: response.result?.content?.[0]?.text ?? '', isError: Boolean(response.result?.isError), data: response.result?.structuredContent ?? {} };
  }
  close() { this.child.kill(); }
}
