'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { Readable, Writable } = require('node:stream');
const test = require('node:test');

const {
  INITIAL_BALANCE_CENTS,
  MAX_BALANCE_CENTS,
  creditBalance,
  debitBalance,
  formatBalance,
  parseAmount,
  runAccountingApp,
} = require('../index');

async function runCli(inputText) {
  const outputChunks = [];
  const output = new Writable({
    write(chunk, encoding, callback) {
      outputChunks.push(chunk.toString());
      callback();
    },
  });

  await runAccountingApp({
    input: Readable.from([inputText]),
    output,
  });
  return outputChunks.join('');
}

function occurrences(text, expression) {
  return (text.match(expression) || []).length;
}

function runCliProcess(inputText) {
  const result = spawnSync(process.execPath, [require.resolve('../index')], {
    input: inputText,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test('[TC-001] starts with the initial account balance', async () => {
  const output = await runCli('1\n4\n');

  assert.equal(INITIAL_BALANCE_CENTS, 100_000);
  assert.match(output, /Current balance: 001000\.00/);
});

test('[TC-002] viewing the balance does not change it', async () => {
  const output = await runCli('1\n1\n4\n');

  assert.equal(occurrences(output, /Current balance: 001000\.00/g), 2);
});

test('[TC-003] credits a decimal amount and exposes the saved balance', async () => {
  const output = await runCli('2\n125.50\n1\n4\n');

  assert.match(output, /Amount credited\. New balance: 001125\.50/);
  assert.match(output, /Current balance: 001125\.50/);
});

test('[TC-004] debits an amount below the balance', async () => {
  const output = await runCli('3\n250.25\n1\n4\n');

  assert.match(output, /Amount debited\. New balance: 000749\.75/);
  assert.match(output, /Current balance: 000749\.75/);
});

test('[TC-005] permits a debit equal to the balance', async () => {
  const output = await runCli('3\n1000.00\n1\n4\n');

  assert.match(output, /Amount debited\. New balance: 000000\.00/);
  assert.match(output, /Current balance: 000000\.00/);
});

test('[TC-006] rejects a debit above the balance without changing it', async () => {
  const output = await runCli('3\n1000.01\n1\n4\n');

  assert.match(output, /Insufficient funds for this debit\./);
  assert.match(output, /Current balance: 001000\.00/);
});

test('[TC-007] accepts a zero-value credit without changing the balance', async () => {
  const output = await runCli('2\n0.00\n1\n4\n');

  assert.match(output, /Amount credited\. New balance: 001000\.00/);
  assert.match(output, /Current balance: 001000\.00/);
});

test('[TC-008] accepts a zero-value debit without changing the balance', async () => {
  const output = await runCli('3\n0.00\n1\n4\n');

  assert.match(output, /Amount debited\. New balance: 001000\.00/);
  assert.match(output, /Current balance: 001000\.00/);
});

test('[TC-009] shares the updated balance across credit and debit operations', async () => {
  const output = await runCli('2\n125.50\n3\n25.50\n1\n4\n');

  assert.match(output, /Current balance: 001100\.00/);
});

test('[TC-010] rejects invalid numeric menu choices and keeps the balance', async () => {
  const output = await runCli('0\n5\n1\n4\n');

  assert.equal(occurrences(output, /Invalid choice, please select 1-4\./g), 2);
  assert.match(output, /Current balance: 001000\.00/);
});

test('[TC-011] exits after option 4 and displays the goodbye message', async () => {
  const output = await runCli('4\n');

  assert.match(output, /Exiting the program\. Goodbye!/);
  assert.equal(occurrences(output, /Account Management System/g), 1);
});

test('[TC-012] resets the in-memory balance when a new app process starts', async () => {
  const firstProcessOutput = runCliProcess('2\n125.50\n4\n');
  const outputOfNewProcess = runCliProcess('1\n4\n');

  assert.match(firstProcessOutput, /Amount credited\. New balance: 001125\.50/);
  assert.match(outputOfNewProcess, /Current balance: 001000\.00/);
});

test('[TC-013] rejects a credit that exceeds the supported balance limit', async () => {
  const output = await runCli('2\n999999.99\n1\n4\n');

  assert.match(output, /Credit would exceed the maximum supported balance\./);
  assert.match(output, /Current balance: 001000\.00/);
  assert.deepEqual(creditBalance(MAX_BALANCE_CENTS, 1), {
    ok: false,
    reason: 'maximum-balance',
  });
});

test('[TC-014] rejects non-numeric and negative amounts without changing the balance', async () => {
  const output = await runCli('2\nabc\n3\nxyz\n2\n-1.00\n3\n-2.00\n1\n4\n');

  assert.equal(occurrences(output, /Invalid amount\./g), 4);
  assert.match(output, /Current balance: 001000\.00/);
  assert.equal(parseAmount('abc'), null);
  assert.equal(parseAmount('-1.00'), null);
});

test('[TC-015] exposes only one shared account and no student selection', async () => {
  const output = await runCli('1\n4\n');

  assert.match(output, /1\. View Balance[\s\S]*2\. Credit Account[\s\S]*3\. Debit Account[\s\S]*4\. Exit/);
  assert.doesNotMatch(output, /Select student|Student ID|Choose account/i);
});

test('amount parsing and balance formatting preserve two decimal places', () => {
  assert.equal(parseAmount('125.5'), 12_550);
  assert.equal(parseAmount('999999.99'), 99_999_999);
  assert.equal(parseAmount('1000000.00'), null);
  assert.equal(parseAmount('1.234'), null);
  assert.equal(formatBalance(100_000), '001000.00');
});

test('debiting the exact available balance produces zero', () => {
  assert.deepEqual(debitBalance(100_000, 100_000), {
    ok: true,
    balanceCents: 0,
  });
});