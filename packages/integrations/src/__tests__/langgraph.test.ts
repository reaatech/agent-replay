import { describe, it, expect, beforeEach } from 'vitest';
import { RecordingEngine } from '@reaatech/core';

import { createLangGraphHooks, langgraphStateAdapter } from '../langgraph.js';

describe('LangGraph Integration', () => {
  let engine: RecordingEngine;

  beforeEach(() => {
    engine = new RecordingEngine();
  });

  describe('createLangGraphHooks', () => {
    it('should create hooks', () => {
      const hooks = createLangGraphHooks({ recordingEngine: engine });
      expect(hooks).toBeDefined();
      expect(typeof hooks.beforeNode).toBe('function');
      expect(typeof hooks.afterNode).toBe('function');
      expect(typeof hooks.onConditionalEdge).toBe('function');
      expect(typeof hooks.onComplete).toBe('function');
      expect(typeof hooks.onError).toBe('function');
    });

    it('should record node execution when recording is active', async () => {
      const session = engine.startRecording({
        name: 'test',
        outputPath: '/tmp/test.artrace.json',
      });

      const hooks = createLangGraphHooks({ recordingEngine: engine });
      await hooks.beforeNode('agent', { messages: [] }, 'run-1');
      await hooks.afterNode('agent', { messages: [] }, { result: 'done' }, 'run-1');

      const trace = engine.stopRecording(session);
      expect(trace.spans.length).toBeGreaterThan(0);
    });

    it('should not record when engine is not recording', async () => {
      const hooks = createLangGraphHooks({ recordingEngine: engine });
      await hooks.beforeNode('agent', { messages: [] }, 'run-1');
      await hooks.afterNode('agent', { messages: [] }, { result: 'done' }, 'run-1');
      expect(engine.isRecording).toBe(false);
    });

    it('should record conditional edges', async () => {
      const session = engine.startRecording({
        name: 'test',
        outputPath: '/tmp/test.artrace.json',
      });

      const hooks = createLangGraphHooks({ recordingEngine: engine });
      await hooks.onConditionalEdge('agent', 'should_continue', 'tool_node', 'run-1');

      const trace = engine.stopRecording(session);
      const routingEvents = trace.spans
        .flatMap(s => s.events)
        .filter(e => e.type === 'response' && e.name === 'routing_decision');
      expect(routingEvents.length).toBeGreaterThan(0);
    });

    it('should record graph completion', async () => {
      const session = engine.startRecording({
        name: 'test',
        outputPath: '/tmp/test.artrace.json',
      });

      const hooks = createLangGraphHooks({ recordingEngine: engine });
      await hooks.onComplete({ messages: [{ role: 'assistant', content: 'Done' }] }, 'run-1');

      const trace = engine.stopRecording(session);
      const snapshotEvents = trace.spans
        .flatMap(s => s.events)
        .filter(e => e.name === 'graph_complete');
      expect(snapshotEvents.length).toBeGreaterThan(0);
    });

    it('should record node errors', async () => {
      const session = engine.startRecording({
        name: 'test',
        outputPath: '/tmp/test.artrace.json',
      });

      const hooks = createLangGraphHooks({ recordingEngine: engine });
      await hooks.beforeNode('agent', { messages: [] }, 'run-1');
      await hooks.onError('agent', new Error('Node failure'), 'run-1');

      const trace = engine.stopRecording(session);
      const errorEvents = trace.spans.flatMap(s => s.events).filter(e => e.type === 'error');
      expect(errorEvents.length).toBeGreaterThan(0);
    });

    it('should create checkpoint at configured nodes', async () => {
      const session = engine.startRecording({
        name: 'test',
        outputPath: '/tmp/test.artrace.json',
      });

      const hooks = createLangGraphHooks({ recordingEngine: engine, checkpointNodes: ['agent'] });
      await hooks.beforeNode('agent', { messages: [] }, 'run-1');
      await hooks.afterNode('agent', { messages: [] }, { result: 'done' }, 'run-1');

      const trace = engine.stopRecording(session);
      expect(trace.checkpoints.length).toBeGreaterThan(0);
    });

    it('should record errors without active run', async () => {
      const session = engine.startRecording({
        name: 'test',
        outputPath: '/tmp/test.artrace.json',
      });

      const hooks = createLangGraphHooks({ recordingEngine: engine });
      await hooks.onError('agent', new Error('Standalone error'), 'run-no-start');

      const trace = engine.stopRecording(session);
      const errorSpans = trace.spans.filter(s => s.kind === 'error');
      expect(errorSpans.length).toBeGreaterThan(0);
    });

    it('should handle tool without parameters', () => {
      const captured = langgraphStateAdapter.capture({
        tools: [{ name: 'search', description: 'Search' }],
      });
      expect(captured.toolRegistry.tools[0].parameters).toEqual({});
    });

    it('should handle unserializable state in beforeNode', async () => {
      const session = engine.startRecording({
        name: 'test',
        outputPath: '/tmp/test.artrace.json',
      });

      const hooks = createLangGraphHooks({ recordingEngine: engine });
      const circular: Record<string, unknown> = { a: 1 };
      circular.self = circular;
      await hooks.beforeNode('agent', circular, 'run-1');
      await hooks.afterNode('agent', circular, { result: 'done' }, 'run-1');

      const trace = engine.stopRecording(session);
      expect(trace.spans.length).toBeGreaterThan(0);
    });
  });

  describe('langgraphStateAdapter', () => {
    it('should identify LangGraph state', () => {
      expect(langgraphStateAdapter.canHandle({ messages: [] })).toBe(true);
      expect(langgraphStateAdapter.canHandle({ chat_history: [] })).toBe(true);
      expect(langgraphStateAdapter.canHandle({ __interrupts: {} })).toBe(true);
      expect(langgraphStateAdapter.canHandle({ unrelated: true })).toBe(false);
      expect(langgraphStateAdapter.canHandle(null)).toBe(false);
    });

    it('should capture messages from state', () => {
      const state = {
        messages: [
          { role: 'user', content: 'Hello' },
          {
            role: 'assistant',
            content: 'Hi there',
            tool_calls: [{ id: 'tc1', name: 'search', args: { q: 'test' } }],
          },
        ],
        tools: [{ name: 'search', description: 'Web search', parameters: { type: 'object' } }],
        counter: 42,
      };

      const captured = langgraphStateAdapter.capture(state);
      expect(captured.conversation.messages).toHaveLength(2);
      expect(captured.conversation.messages[0].role).toBe('user');
      expect(captured.conversation.messages[1].toolCalls).toHaveLength(1);
      expect(captured.conversation.messages[1].toolCalls![0].name).toBe('search');
      expect(captured.toolRegistry.tools).toHaveLength(1);
      expect(captured.variables.counter).toBe(42);
    });

    it('should skip messages without string content', () => {
      const state = {
        messages: [{ role: 'user' }, { role: 'assistant', content: 'Hi' }],
      };

      const captured = langgraphStateAdapter.capture(state);
      expect(captured.conversation.messages).toHaveLength(1);
      expect(captured.conversation.messages[0].content).toBe('Hi');
    });

    it('should skip tools without name', () => {
      const state = {
        tools: [{ description: 'No name tool' }],
      };

      const captured = langgraphStateAdapter.capture(state);
      expect(captured.toolRegistry.tools).toHaveLength(0);
    });

    it('should restore state', () => {
      const snapshot = {
        variables: { counter: 5 },
        memory: { entries: [] },
        conversation: {
          messages: [
            { role: 'user' as const, content: 'Hello' },
            {
              role: 'assistant' as const,
              content: 'Hi',
              toolCalls: [{ id: '1', name: 'search', arguments: {} }],
            },
          ],
        },
        toolRegistry: {
          tools: [{ name: 'search', description: '', parameters: {} }],
        },
      };

      const restored = langgraphStateAdapter.restore(snapshot);
      expect(restored).toBeDefined();
      expect(Array.isArray((restored as Record<string, unknown>).messages)).toBe(true);
      expect((restored as Record<string, unknown>).counter).toBe(5);
    });
  });
});
