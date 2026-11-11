// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/ui/app';
import { fixtureText } from './helpers';

const text = () => document.body.textContent ?? '';
const tick = (label: string) => {
  const row = [...document.querySelectorAll('tr')].find((tr) => tr.textContent?.includes(label))!;
  row.querySelector('input')!.click();
};

describe('the page', () => {
  let app: ReturnType<typeof createApp>;
  beforeEach(() => {
    document.body.innerHTML = '<main id="app"></main>';
    app = createApp(document.getElementById('app')!);
  });

  it('starts with just the file picker', () => {
    expect(document.querySelectorAll('section')).toHaveLength(1);
  });

  it('walks through files, payers, earnings and withdrawals', () => {
    app.addTexts([
      { name: 'sample-a.csv', text: fixtureText('sample-a.csv') },
      { name: 'sample-b.csv', text: fixtureText('sample-b.csv') },
    ]);
    expect(text()).toContain('15 transactions appeared in more than one file');
    expect(text()).toContain('Also shown as: S. Fakename Ltd');
    expect(text()).toContain('Other money in');
    expect(text()).toContain('Tick at least one payer');
    // Withdrawals show without ticking anything.
    expect(text()).toContain('£1,190.00');
    expect(text()).toContain('3 withdrawals, less 1 that bounced back');
    // Part years are flagged.
    expect(text()).toContain('Your files do not cover every tax year in full');

    tick('Fake Platform Inc');
    expect(text()).toContain('about £1,664.25');
    expect(text()).toContain('0.7925 GBP per 1 USD');
    expect(text()).toContain("Pounds at HMRC's rates");
    expect(text()).toContain("valued at HMRC's published rate for the month it arrived");
    expect(text()).toContain('No estimate: PayPal converted no USD to GBP in this tax year');

    tick('Fake Platform Inc');
    expect(text()).not.toContain('£1,664.25');
    expect(text()).not.toMatch(/tax you owe/i);
  });

  it('shows a clear error for an unknown layout and counts nothing from it', () => {
    app.addTexts([{ name: 'other.csv', text: fixtureText('other-layout.csv') }]);
    expect(text()).toContain('not in a PayPal layout this tool can read');
    expect(document.querySelectorAll('input[type=checkbox]')).toHaveLength(0);
  });

  it('never turns file contents into markup', () => {
    const evil = fixtureText('sample-a.csv').replace('Sam Fakename', '<img src=x onerror=alert(1)>');
    app.addTexts([{ name: 'evil.csv', text: evil }]);
    expect(document.querySelector('img')).toBeNull();
    expect(text()).toContain('<img src=x');
  });
});
