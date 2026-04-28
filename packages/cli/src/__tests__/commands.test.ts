import { describe, it, expect } from 'vitest';
import { Command, Option } from 'commander';

import { recordCommand } from '../commands/record.js';
import { replayCommand } from '../commands/replay.js';
import { exploreCommand } from '../commands/explore.js';
import { diffCommand } from '../commands/diff.js';
import { debugCommand } from '../commands/debug.js';

/**
 * Helper to parse options from a command without invoking its action handler.
 * Replicates the source command's options on a temporary command and parses argv.
 */
function parseOptions(command: Command, argv: string[]): Record<string, unknown> {
  const testCmd = new Command(command.name()).exitOverride();
  testCmd.configureOutput({ writeErr: () => {} });
  for (const opt of command.options) {
    const newOpt = new Option(opt.flags, opt.description);
    if (opt.defaultValue !== undefined) newOpt.default(opt.defaultValue);
    if (opt.mandatory) newOpt.makeOptionMandatory();
    if (opt.parseArg) newOpt.argParser(opt.parseArg);
    testCmd.addOption(newOpt);
  }
  testCmd.parse(['node', 'test', ...argv]);
  return testCmd.opts();
}

function getOption(command: Command, longFlag: string): Option | undefined {
  return command.options.find(o => o.long === longFlag);
}

describe('record command', () => {
  it('should have correct name and description', () => {
    expect(recordCommand.name()).toBe('record');
    expect(recordCommand.description()).toBe('Record an agent interaction');
  });

  it('should have --output as a required option', () => {
    const opt = getOption(recordCommand, '--output');
    expect(opt).toBeDefined();
    expect(opt?.mandatory).toBe(true);
    expect(opt?.description).toBe('Output path for the trace file');
  });

  it('should have --name option with default "unnamed"', () => {
    const opt = getOption(recordCommand, '--name');
    expect(opt).toBeDefined();
    expect(opt?.defaultValue).toBe('unnamed');
    expect(opt?.description).toBe('Recording name');
  });

  it('should have --providers option with default "openai"', () => {
    const opt = getOption(recordCommand, '--providers');
    expect(opt).toBeDefined();
    expect(opt?.defaultValue).toBe('openai');
    expect(opt?.description).toBe('Comma-separated list of providers to intercept');
  });

  it('should have --no-state option', () => {
    const opt = getOption(recordCommand, '--no-state');
    expect(opt).toBeDefined();
    expect(opt?.description).toBe('Disable state capture');
    expect(opt?.negate).toBe(true);
  });

  it('should default state to true', () => {
    const opts = parseOptions(recordCommand, ['-o', '/tmp/out.artrace']);
    expect(opts.state).toBe(true);
  });

  it('should parse all options correctly', () => {
    const opts = parseOptions(recordCommand, [
      '-o',
      '/tmp/recording.artrace',
      '-n',
      'my-recording',
      '-p',
      'openai,anthropic',
      '--no-state',
    ]);
    expect(opts.output).toBe('/tmp/recording.artrace');
    expect(opts.name).toBe('my-recording');
    expect(opts.providers).toBe('openai,anthropic');
    expect(opts.state).toBe(false);
  });

  it('should parse options using long flags', () => {
    const opts = parseOptions(recordCommand, [
      '--output',
      '/tmp/out.artrace',
      '--name',
      'test',
      '--providers',
      'openai',
    ]);
    expect(opts.output).toBe('/tmp/out.artrace');
    expect(opts.name).toBe('test');
    expect(opts.providers).toBe('openai');
    expect(opts.state).toBe(true);
  });

  it('should require --output option', () => {
    expect(() => parseOptions(recordCommand, [])).toThrow();
  });
});

describe('replay command', () => {
  it('should have correct name and description', () => {
    expect(replayCommand.name()).toBe('replay');
    expect(replayCommand.description()).toBe('Replay a recorded trace');
  });

  it('should have --trace as a required option', () => {
    const opt = getOption(replayCommand, '--trace');
    expect(opt).toBeDefined();
    expect(opt?.mandatory).toBe(true);
    expect(opt?.description).toBe('Path to the trace file');
  });

  it('should have --mode option with default "stubbed"', () => {
    const opt = getOption(replayCommand, '--mode');
    expect(opt).toBeDefined();
    expect(opt?.defaultValue).toBe('stubbed');
    expect(opt?.description).toContain('Replay mode');
  });

  it('should have --checkpoint option with no default', () => {
    const opt = getOption(replayCommand, '--checkpoint');
    expect(opt).toBeDefined();
    expect(opt?.defaultValue).toBeUndefined();
    expect(opt?.description).toBe('Checkpoint ID for partial replay');
  });

  it('should have --progress option with default false', () => {
    const opt = getOption(replayCommand, '--progress');
    expect(opt).toBeDefined();
    expect(opt?.defaultValue).toBe(false);
    expect(opt?.description).toBe('Show progress');
  });

  it('should parse all options correctly', () => {
    const opts = parseOptions(replayCommand, [
      '-t',
      '/tmp/trace.artrace',
      '-m',
      'partial',
      '-c',
      'cp-3',
      '--progress',
    ]);
    expect(opts.trace).toBe('/tmp/trace.artrace');
    expect(opts.mode).toBe('partial');
    expect(opts.checkpoint).toBe('cp-3');
    expect(opts.progress).toBe(true);
  });

  it('should parse options using long flags', () => {
    const opts = parseOptions(replayCommand, ['--trace', '/tmp/trace.artrace', '--mode', 'live']);
    expect(opts.trace).toBe('/tmp/trace.artrace');
    expect(opts.mode).toBe('live');
    expect(opts.progress).toBe(false);
    expect(opts.checkpoint).toBeUndefined();
  });

  it('should require --trace option', () => {
    expect(() => parseOptions(replayCommand, [])).toThrow();
  });
});

describe('explore command', () => {
  it('should have correct name and description', () => {
    expect(exploreCommand.name()).toBe('explore');
    expect(exploreCommand.description()).toBe('Explore a trace file interactively');
  });

  it('should have --trace as a required option', () => {
    const opt = getOption(exploreCommand, '--trace');
    expect(opt).toBeDefined();
    expect(opt?.mandatory).toBe(true);
    expect(opt?.description).toBe('Path to the trace file');
  });

  it('should have --format option with default "table"', () => {
    const opt = getOption(exploreCommand, '--format');
    expect(opt).toBeDefined();
    expect(opt?.defaultValue).toBe('table');
    expect(opt?.description).toBe('Output format (table, json, tree)');
  });

  it('should parse all options correctly', () => {
    const opts = parseOptions(exploreCommand, ['-t', '/tmp/trace.artrace', '-f', 'json']);
    expect(opts.trace).toBe('/tmp/trace.artrace');
    expect(opts.format).toBe('json');
  });

  it('should parse options using long flags', () => {
    const opts = parseOptions(exploreCommand, [
      '--trace',
      '/tmp/trace.artrace',
      '--format',
      'tree',
    ]);
    expect(opts.trace).toBe('/tmp/trace.artrace');
    expect(opts.format).toBe('tree');
  });

  it('should default format to table', () => {
    const opts = parseOptions(exploreCommand, ['-t', '/tmp/trace.artrace']);
    expect(opts.format).toBe('table');
  });

  it('should require --trace option', () => {
    expect(() => parseOptions(exploreCommand, [])).toThrow();
  });
});

describe('diff command', () => {
  it('should have correct name and description', () => {
    expect(diffCommand.name()).toBe('diff');
    expect(diffCommand.description()).toBe('Compare two traces and show differences');
  });

  it('should have --baseline as a required option', () => {
    const opt = getOption(diffCommand, '--baseline');
    expect(opt).toBeDefined();
    expect(opt?.mandatory).toBe(true);
    expect(opt?.description).toBe('Path to the baseline trace');
  });

  it('should have --current as a required option', () => {
    const opt = getOption(diffCommand, '--current');
    expect(opt).toBeDefined();
    expect(opt?.mandatory).toBe(true);
    expect(opt?.description).toBe('Path to the current trace');
  });

  it('should have --format option with default "human"', () => {
    const opt = getOption(diffCommand, '--format');
    expect(opt).toBeDefined();
    expect(opt?.defaultValue).toBe('human');
    expect(opt?.description).toBe('Output format (human, json)');
  });

  it('should have --similarity option with default "0.95"', () => {
    const opt = getOption(diffCommand, '--similarity');
    expect(opt).toBeDefined();
    expect(opt?.defaultValue).toBe('0.95');
    expect(opt?.description).toBe('Text similarity threshold (0-1)');
  });

  it('should parse all options correctly', () => {
    const opts = parseOptions(diffCommand, [
      '-b',
      '/tmp/baseline.artrace',
      '-c',
      '/tmp/current.artrace',
      '-f',
      'json',
      '-s',
      '0.85',
    ]);
    expect(opts.baseline).toBe('/tmp/baseline.artrace');
    expect(opts.current).toBe('/tmp/current.artrace');
    expect(opts.format).toBe('json');
    expect(opts.similarity).toBe('0.85');
  });

  it('should parse options using long flags', () => {
    const opts = parseOptions(diffCommand, [
      '--baseline',
      '/tmp/baseline.artrace',
      '--current',
      '/tmp/current.artrace',
      '--format',
      'human',
      '--similarity',
      '0.90',
    ]);
    expect(opts.baseline).toBe('/tmp/baseline.artrace');
    expect(opts.current).toBe('/tmp/current.artrace');
    expect(opts.format).toBe('human');
    expect(opts.similarity).toBe('0.90');
  });

  it('should default format to human and similarity to 0.95', () => {
    const opts = parseOptions(diffCommand, [
      '-b',
      '/tmp/baseline.artrace',
      '-c',
      '/tmp/current.artrace',
    ]);
    expect(opts.format).toBe('human');
    expect(opts.similarity).toBe('0.95');
  });

  it('should require --baseline option', () => {
    expect(() => parseOptions(diffCommand, ['-c', '/tmp/current.artrace'])).toThrow();
  });

  it('should require --current option', () => {
    expect(() => parseOptions(diffCommand, ['-b', '/tmp/baseline.artrace'])).toThrow();
  });
});

describe('debug command', () => {
  it('should have correct name and description', () => {
    expect(debugCommand.name()).toBe('debug');
    expect(debugCommand.description()).toBe(
      'Debug a trace with step-through, breakpoints, and watchpoints'
    );
  });

  it('should have --trace as a required option', () => {
    const opt = getOption(debugCommand, '--trace');
    expect(opt).toBeDefined();
    expect(opt?.mandatory).toBe(true);
    expect(opt?.description).toBe('Path to the trace file');
  });

  it('should have --span option with no default', () => {
    const opt = getOption(debugCommand, '--span');
    expect(opt).toBeDefined();
    expect(opt?.defaultValue).toBeUndefined();
    expect(opt?.description).toBe('Break on span name (exact match)');
  });

  it('should have --kind option with no default', () => {
    const opt = getOption(debugCommand, '--kind');
    expect(opt).toBeDefined();
    expect(opt?.defaultValue).toBeUndefined();
    expect(opt?.description).toBe(
      'Break on span kind (llm_call, tool_call, agent_step, routing_decision, state_change, error)'
    );
  });

  it('should have --step option with no default', () => {
    const opt = getOption(debugCommand, '--step');
    expect(opt).toBeDefined();
    expect(opt?.defaultValue).toBeUndefined();
    expect(opt?.description).toBe('Break at a specific step index');
  });

  it('should have --watch option with default empty array', () => {
    const opt = getOption(debugCommand, '--watch');
    expect(opt).toBeDefined();
    expect(Array.isArray(opt?.defaultValue)).toBe(true);
    expect(opt?.defaultValue).toEqual([]);
    expect(opt?.description).toBe('Add a watch expression (can be used multiple times)');
  });

  it('should have --annotations option with default false', () => {
    const opt = getOption(debugCommand, '--annotations');
    expect(opt).toBeDefined();
    expect(opt?.defaultValue).toBe(false);
    expect(opt?.description).toBe('Show annotations for each span');
  });

  it('should parse all options correctly', () => {
    const opts = parseOptions(debugCommand, [
      '-t',
      '/tmp/trace.artrace',
      '-s',
      'my-span',
      '-k',
      'llm_call',
      '--step',
      '5',
      '-w',
      'expr1',
      '-w',
      'expr2',
      '--annotations',
    ]);
    expect(opts.trace).toBe('/tmp/trace.artrace');
    expect(opts.span).toBe('my-span');
    expect(opts.kind).toBe('llm_call');
    expect(opts.step).toBe('5');
    expect(opts.watch).toEqual(['expr1', 'expr2']);
    expect(opts.annotations).toBe(true);
  });

  it('should parse options using long flags', () => {
    const opts = parseOptions(debugCommand, [
      '--trace',
      '/tmp/trace.artrace',
      '--span',
      'another-span',
      '--kind',
      'tool_call',
      '--step',
      '10',
      '--watch',
      'foo',
      '--watch',
      'bar',
    ]);
    expect(opts.trace).toBe('/tmp/trace.artrace');
    expect(opts.span).toBe('another-span');
    expect(opts.kind).toBe('tool_call');
    expect(opts.step).toBe('10');
    expect(opts.watch).toEqual(['foo', 'bar']);
    expect(opts.annotations).toBe(false);
  });

  it('should default watch to empty array', () => {
    const opts = parseOptions(debugCommand, ['-t', '/tmp/trace.artrace']);
    expect(opts.watch).toEqual([]);
  });

  it('should default annotations to false', () => {
    const opts = parseOptions(debugCommand, ['-t', '/tmp/trace.artrace']);
    expect(opts.annotations).toBe(false);
  });

  it('should require --trace option', () => {
    expect(() => parseOptions(debugCommand, [])).toThrow();
  });

  it('should collect multiple watch values', () => {
    const opts = parseOptions(debugCommand, [
      '-t',
      '/tmp/trace.artrace',
      '-w',
      'a',
      '-w',
      'b',
      '-w',
      'c',
    ]);
    expect(opts.watch).toEqual(['a', 'b', 'c']);
  });
});

describe('CLI command suite', () => {
  it('should contain all five commands in a program', () => {
    const program = new Command();
    program.addCommand(recordCommand);
    program.addCommand(replayCommand);
    program.addCommand(exploreCommand);
    program.addCommand(diffCommand);
    program.addCommand(debugCommand);
    expect(program.commands).toHaveLength(5);
    const names = program.commands.map(c => c.name());
    expect(names).toContain('record');
    expect(names).toContain('replay');
    expect(names).toContain('explore');
    expect(names).toContain('diff');
    expect(names).toContain('debug');
  });
});
