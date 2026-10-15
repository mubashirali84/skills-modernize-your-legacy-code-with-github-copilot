'use strict';

const readline = require('node:readline');
const { stdin, stdout } = require('node:process');

const INITIAL_BALANCE_CENTS = 100_000;
const MAX_BALANCE_CENTS = 99_999_999;
const MAX_AMOUNT_CENTS = 99_999_999;

function parseAmount(input) {
  const value = input.trim();
  if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(value)) {
    return null;
  }

  const [whole, fraction = ''] = value.split('.');
  const amountCents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return amountCents <= MAX_AMOUNT_CENTS ? amountCents : null;
}

function formatBalance(balanceCents) {
  const whole = Math.floor(balanceCents / 100);
  const fraction = balanceCents % 100;
  return `${String(whole).padStart(6, '0')}.${String(fraction).padStart(2, '0')}`;
}

function creditBalance(balanceCents, amountCents) {
  const updatedBalance = balanceCents + amountCents;
  if (updatedBalance > MAX_BALANCE_CENTS) {
    return { ok: false, reason: 'maximum-balance' };
  }
  return { ok: true, balanceCents: updatedBalance };
}

function debitBalance(balanceCents, amountCents) {
  if (balanceCents < amountCents) {
    return { ok: false, reason: 'insufficient-funds' };
  }
  return { ok: true, balanceCents: balanceCents - amountCents };
}

async function runAccountingApp({ input = stdin, output = stdout } = {}) {
  const terminal = readline.createInterface({ input, output });
  const lines = terminal[Symbol.asyncIterator]();
  const ask = async (prompt) => {
    output.write(prompt);
    const { value, done } = await lines.next();
    return done ? null : value;
  };
  let balanceCents = INITIAL_BALANCE_CENTS;
  let running = true;

  try {
    while (running) {
      output.write('--------------------------------\n');
      output.write('Account Management System\n');
      output.write('1. View Balance\n');
      output.write('2. Credit Account\n');
      output.write('3. Debit Account\n');
      output.write('4. Exit\n');
      output.write('--------------------------------\n');

      const choiceInput = await ask('Enter your choice (1-4): ');
      if (choiceInput === null) {
        running = false;
        break;
      }
      const choice = choiceInput.trim();

      if (choice === '1') {
        output.write(`Current balance: ${formatBalance(balanceCents)}\n`);
      } else if (choice === '2' || choice === '3') {
        const action = choice === '2' ? 'credit' : 'debit';
        const rawAmount = await ask(`Enter ${action} amount: `);
        if (rawAmount === null) {
          running = false;
          break;
        }
        const amountCents = parseAmount(rawAmount);

        if (amountCents === null) {
          output.write('Invalid amount. Enter a non-negative amount with up to six integer digits and two decimal places.\n');
          continue;
        }

        if (choice === '2') {
          const result = creditBalance(balanceCents, amountCents);
          if (!result.ok) {
            output.write('Credit would exceed the maximum supported balance.\n');
            continue;
          }
          balanceCents = result.balanceCents;
          output.write(`Amount credited. New balance: ${formatBalance(balanceCents)}\n`);
        } else {
          const result = debitBalance(balanceCents, amountCents);
          if (!result.ok) {
            output.write('Insufficient funds for this debit.\n');
            continue;
          }
          balanceCents = result.balanceCents;
          output.write(`Amount debited. New balance: ${formatBalance(balanceCents)}\n`);
        }
      } else if (choice === '4') {
        running = false;
      } else {
        output.write('Invalid choice, please select 1-4.\n');
      }
    }

    output.write('Exiting the program. Goodbye!\n');
  } finally {
    terminal.close();
  }
}

if (require.main === module) {
  runAccountingApp().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  INITIAL_BALANCE_CENTS,
  MAX_AMOUNT_CENTS,
  MAX_BALANCE_CENTS,
  creditBalance,
  debitBalance,
  formatBalance,
  parseAmount,
  runAccountingApp,
};