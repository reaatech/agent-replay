import { describe, expect, it } from 'vitest';

import { createLangChainHandler, langchainStateAdapter } from '../langchain.js';
import { createLangGraphHooks, langgraphStateAdapter } from '../langgraph.js';

describe('Integration Exports', () => {
  it('should export LangChain handler factory', () => {
    expect(typeof createLangChainHandler).toBe('function');
    expect(langchainStateAdapter.framework).toBe('langchain');
  });

  it('should export LangGraph hooks factory', () => {
    expect(typeof createLangGraphHooks).toBe('function');
    expect(langgraphStateAdapter.framework).toBe('langgraph');
  });
});
