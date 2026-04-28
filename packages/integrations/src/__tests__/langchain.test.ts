import { describe, it, expect, beforeEach } from 'vitest';
import { RecordingEngine } from '@reaatech/core';

import { createLangChainHandler, langchainStateAdapter } from '../langchain.js';

describe('LangChain Integration', () => {
  let engine: RecordingEngine;

  beforeEach(() => {
    engine = new RecordingEngine();
  });

  describe('createLangChainHandler', () => {
    it('should create a handler', () => {
      const handler = createLangChainHandler({ recordingEngine: engine });
      expect(handler).toBeDefined();
      expect(typeof handler.handleLLMStart).toBe('function');
      expect(typeof handler.handleLLMEnd).toBe('function');
      expect(typeof handler.handleToolStart).toBe('function');
      expect(typeof handler.handleToolEnd).toBe('function');
      expect(typeof handler.handleChainStart).toBe('function');
      expect(typeof handler.handleChainEnd).toBe('function');
      expect(typeof handler.handleError).toBe('function');
    });

    it('should record LLM calls when recording is active', async () => {
      const session = engine.startRecording({
        name: 'test',
        outputPath: '/tmp/test.artrace.json',
      });

      const handler = createLangChainHandler({ recordingEngine: engine });
      await handler.handleLLMStart({ name: 'gpt-4', model: 'gpt-4' }, ['Hello'], 'run-1');
      await handler.handleLLMEnd(
        { text: 'Hi there', usage: { prompt: 1, completion: 2, total: 3 } },
        'run-1'
      );

      const trace = engine.stopRecording(session);
      expect(trace.spans.length).toBeGreaterThan(0);
    });

    it('should not record when engine is not recording', async () => {
      const handler = createLangChainHandler({ recordingEngine: engine });
      // Should not throw even if engine is not recording
      await handler.handleLLMStart({ name: 'gpt-4', model: 'gpt-4' }, ['Hello'], 'run-1');
      await handler.handleLLMEnd({ text: 'Hi' }, 'run-1');
      expect(engine.isRecording).toBe(false);
    });

    it('should record tool calls', async () => {
      const session = engine.startRecording({
        name: 'test',
        outputPath: '/tmp/test.artrace.json',
      });

      const handler = createLangChainHandler({ recordingEngine: engine });
      await handler.handleToolStart({ name: 'search', args: { query: 'test' } }, 'run-2');
      await handler.handleToolEnd('search results', 'run-2');

      const trace = engine.stopRecording(session);
      expect(trace.spans.length).toBeGreaterThan(0);
    });

    it('should record chain steps', async () => {
      const session = engine.startRecording({
        name: 'test',
        outputPath: '/tmp/test.artrace.json',
      });

      const handler = createLangChainHandler({ recordingEngine: engine });
      await handler.handleChainStart({ name: 'agent' }, { input: 'query' }, 'run-3');
      await handler.handleChainEnd({ output: 'result' }, 'run-3');

      const trace = engine.stopRecording(session);
      expect(trace.spans.length).toBeGreaterThan(0);
    });

    it('should record errors', async () => {
      const session = engine.startRecording({
        name: 'test',
        outputPath: '/tmp/test.artrace.json',
      });

      const handler = createLangChainHandler({ recordingEngine: engine });
      await handler.handleLLMStart({ name: 'gpt-4', model: 'gpt-4' }, ['Hello'], 'run-4');
      await handler.handleError(new Error('API failure'), 'run-4');

      const trace = engine.stopRecording(session);
      const errorEvents = trace.spans.flatMap(s => s.events).filter(e => e.type === 'error');
      expect(errorEvents.length).toBeGreaterThan(0);
    });

    it('should record errors without active run', async () => {
      const session = engine.startRecording({
        name: 'test',
        outputPath: '/tmp/test.artrace.json',
      });

      const handler = createLangChainHandler({ recordingEngine: engine });
      await handler.handleError(new Error('Standalone error'), 'run-no-start');

      const trace = engine.stopRecording(session);
      const errorSpans = trace.spans.filter(s => s.kind === 'error');
      expect(errorSpans.length).toBeGreaterThan(0);
    });

    it('should support captureState flag', async () => {
      const session = engine.startRecording({
        name: 'test',
        outputPath: '/tmp/test.artrace.json',
      });

      const handler = createLangChainHandler({ recordingEngine: engine, captureState: true });
      await handler.handleLLMStart({ name: 'gpt-4', model: 'gpt-4' }, ['Hello'], 'run-5');
      await handler.handleLLMEnd({ text: 'Hi' }, 'run-5');

      const trace = engine.stopRecording(session);
      expect(trace.spans.length).toBeGreaterThan(0);
    });
  });

  describe('langchainStateAdapter', () => {
    it('should identify LangChain state', () => {
      expect(langchainStateAdapter.canHandle({ memory: { buffer: 'hello' } })).toBe(true);
      expect(langchainStateAdapter.canHandle({ chat_history: [] })).toBe(true);
      expect(langchainStateAdapter.canHandle({ llm: { model: 'gpt-4' } })).toBe(true);
      expect(langchainStateAdapter.canHandle({ tools: [] })).toBe(true);
      expect(langchainStateAdapter.canHandle({ unrelated: true })).toBe(false);
      expect(langchainStateAdapter.canHandle(null)).toBe(false);
    });

    it('should capture state from memory.buffer', () => {
      const state = {
        memory: { buffer: 'conversation history' },
        tools: [{ name: 'search', description: 'Search web', parameters: {} }],
        input: 'query',
      };

      const captured = langchainStateAdapter.capture(state);
      expect(captured.conversation.messages).toHaveLength(1);
      expect(captured.conversation.messages[0].content).toBe('conversation history');
      expect(captured.toolRegistry.tools).toHaveLength(1);
      expect(captured.variables.input).toBe('query');
    });

    it('should capture state from chat_history', () => {
      const state = {
        chat_history: [
          { role: 'user' as const, content: 'Hello' },
          { role: 'assistant' as const, content: 'Hi' },
        ],
      };

      const captured = langchainStateAdapter.capture(state);
      expect(captured.conversation.messages).toHaveLength(2);
      expect(captured.conversation.messages[0].role).toBe('user');
      expect(captured.conversation.messages[1].role).toBe('assistant');
    });

    it('should capture state from memory.chat_history', () => {
      const state = {
        memory: {
          chat_history: [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi' },
          ],
        },
      };

      const captured = langchainStateAdapter.capture(state);
      expect(captured.conversation.messages).toHaveLength(2);
    });

    it('should handle tools without parameters object', () => {
      const state = {
        tools: [{ name: 'search', description: 'Search web' }],
      };

      const captured = langchainStateAdapter.capture(state);
      expect(captured.toolRegistry.tools[0].parameters).toEqual({});
    });

    it('should restore state', () => {
      const snapshot = {
        variables: { input: 'test' },
        memory: { entries: [] },
        conversation: {
          messages: [
            { role: 'user' as const, content: 'Hello' },
            { role: 'assistant' as const, content: 'Hi' },
          ],
        },
        toolRegistry: {
          tools: [{ name: 'search', description: '', parameters: {} }],
        },
      };

      const restored = langchainStateAdapter.restore(snapshot);
      expect(restored).toBeDefined();
    });
  });
});
