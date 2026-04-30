import { LocalFileStorage, RecordingEngine } from '@reaatech/agent-replay-core';

async function main() {
  const engine = new RecordingEngine();
  const session = engine.startRecording({
    name: 'basic-example',
    outputPath: './basic-trace.artrace.json',
  });

  // Simulate an agent workflow
  const span1 = engine.startSpan('greeting', 'llm_call');
  engine.captureEvent(
    {
      timestamp: Date.now(),
      type: 'response',
      name: 'llm-response',
      attributes: { model: 'gpt-4' },
      data: { content: 'Hello! How can I help you today?' },
    },
    { spanId: span1 },
  );
  engine.endSpan(span1, 'ok');

  const span2 = engine.startSpan('search', 'tool_call');
  engine.captureEvent(
    {
      timestamp: Date.now(),
      type: 'request',
      name: 'tool-request',
      attributes: { tool: 'web_search' },
      data: { query: 'TypeScript best practices' },
    },
    { spanId: span2 },
  );
  engine.captureEvent(
    {
      timestamp: Date.now(),
      type: 'response',
      name: 'tool-response',
      attributes: { tool: 'web_search' },
      data: { results: ['Result 1', 'Result 2'] },
    },
    { spanId: span2 },
  );
  engine.endSpan(span2, 'ok');

  const trace = engine.stopRecording(session);
  console.log(`Recorded ${trace.spans.length} spans`);

  const storage = new LocalFileStorage('.');
  const savedPath = await storage.save(trace);
  console.log(`Trace saved to ${savedPath}`);
}

main().catch(console.error);
