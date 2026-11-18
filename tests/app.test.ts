// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from '../src/ui/app';
import { welcomeHtml } from '../src/ui/welcome';
import { fixtureText } from './helpers';

const text = () => document.body.textContent ?? '';
const title = () => document.querySelector('.wiz-head h1')?.textContent;
const findButton = (label: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === label)!;
const press = (label: string) => findButton(label).click();
const tick = (label: string) => {
  const row = [...document.querySelectorAll('tr')].find((tr) => tr.textContent?.includes(label))!;
  row.querySelector('input')!.click();
};
const choose = (id: string, value: string) => {
  const el = document.getElementById(id) as HTMLSelectElement | HTMLInputElement;
  el.value = value;
  el.dispatchEvent(new Event('change'));
};
const samples = () => [
  { name: 'sample-a.csv', text: fixtureText('sample-a.csv') },
  { name: 'sample-b.csv', text: fixtureText('sample-b.csv') },
];

describe('the wizard', () => {
  let app: ReturnType<typeof createApp>;
  beforeEach(() => {
    document.body.innerHTML = '<main id="app"></main>';
    app = createApp(document.getElementById('app')!, '2025-06-01');
  });

  it('starts on the welcome page with one way forward', () => {
    expect(text()).toContain('PayPal Income Calculator');
    expect(document.querySelectorAll('button')).toHaveLength(1);
    expect(document.querySelector('input')).toBeNull();
  });

  it('walks page by page from the guide to the withdrawals', () => {
    press('Get started');
    expect(title()).toBe('Get your files from PayPal');
    expect(text()).toContain('Step 1 of 5');
    expect(document.querySelectorAll('.guide li')).toHaveLength(5);
    expect(document.querySelector<HTMLAnchorElement>('.guide a')!.href).toBe('https://www.paypal.com/reports/');
    expect(document.querySelectorAll('.guide img')).toHaveLength(4);
    expect([...document.querySelectorAll<HTMLImageElement>('.guide img')].every((img) => img.alt.length > 10)).toBe(true);

    press('I have my files');
    expect(title()).toBe('Add your PayPal files');
    expect(findButton('Next').disabled).toBe(true);

    app.addTexts(samples());
    expect(text()).toContain('15 transactions appeared in more than one file');
    expect(findButton('Next').disabled).toBe(false);

    press('Next');
    expect(title()).toBe('Tick who paid you for work');
    expect(text()).toContain('Also shown as: S. Fakename Ltd');
    expect(text()).toContain('Other money in');
    expect(text()).toContain('Nothing ticked yet');
    tick('Fake Platform Inc');
    expect(text()).toContain('1 ticked');

    press('See earnings');
    expect(title()).toBe('Earnings by tax year');
    // A late start and a year still running are plain notes, not warnings.
    expect(text()).toContain('Counted from 10 Mar 2024, the first transaction in your files');
    expect(text()).toContain('This tax year is not over yet. Counted up to 10 May 2025');
    expect(text()).toContain('part year');
    expect(text()).toContain('so far');
    expect(document.querySelector('.warn.box')).toBeNull();
    // An estimate carries the "estimate" tag, not the word "about" as well.
    expect(text()).toContain('£1,664.25 estimate');
    expect(text()).not.toContain('about £');
    expect(text()).toContain('US$1 = £0.7925');
    expect(text()).toContain('US$1 = £0.7871');
    expect(text()).toContain("Pounds at HMRC's rates");
    expect(text()).not.toContain('GBP per 1 USD');
    expect(text()).toContain('No estimate');
    expect(text()).toContain('PayPal converted no USD to GBP this tax year');
    expect(text()).not.toMatch(/tax you owe/i);

    press('See withdrawals');
    expect(title()).toBe('Money withdrawn to your card or bank');
    expect(text()).toContain('Step 5 of 5');
    expect(text()).toContain('£1,190.00');
    expect(text()).toContain('3 withdrawals, less 1 that bounced back');
  });

  it('goes back without losing files or ticks', () => {
    app.goTo('files');
    app.addTexts(samples());
    press('Next');
    tick('Fake Platform Inc');
    press('See earnings');
    press('Back');
    expect(title()).toBe('Tick who paid you for work');
    expect(document.querySelectorAll('input:checked')).toHaveLength(1);
    expect(document.querySelectorAll('tr.selected')).toHaveLength(1);
    press('Back');
    expect(text()).toContain('sample-a.csv');
  });

  it('warns only about a gap between files', () => {
    const header = fixtureText('sample-a.csv').split('\n')[0];
    const row = (date: string, id: string) =>
      `"${date}","10:00:00","Europe/London","Mobile Payment","GBP","10.00","0.00","10.00","50.00","${id}","a@example.com","A","","","0.00","0.00","",""`;
    app.goTo('files');
    app.addTexts([
      { name: 'X-CSR-20240406000000-20240630235959-20240701010101.csv', text: [header, row('01/05/2024', 'A1')].join('\n') },
      { name: 'X-CSR-20240901000000-20250405235959-20250406010101.csv', text: [header, row('01/10/2024', 'A2')].join('\n') },
    ]);
    app.goTo('earnings');
    const box = document.querySelector('.warn.box')!;
    expect(box.textContent).toContain('There is a gap between your files');
    expect(box.textContent).toContain('2024-25: 1 Jul 2024 to 31 Aug 2024');
    expect(text()).not.toContain('part year');
  });

  it('ticks a payer when you click anywhere on its row', () => {
    app.goTo('files');
    app.addTexts(samples());
    app.goTo('payers');
    const row = [...document.querySelectorAll('tr')].find((tr) => tr.textContent?.includes('Riverside Fake Studio'))!;
    const box = row.querySelector('input')!;

    row.querySelector<HTMLElement>('td.num')!.click();
    expect(box.checked).toBe(true);
    expect(row.classList.contains('selected')).toBe(true);
    expect(text()).toContain('1 ticked');

    // The name is a label for the box, so it must not toggle twice.
    row.querySelector('label')!.click();
    expect(box.checked).toBe(false);
    box.click();
    expect(box.checked).toBe(true);
    row.querySelector<HTMLElement>('td.num')!.click();
    expect(box.checked).toBe(false);
    expect(text()).toContain('Nothing ticked yet');
  });

  it('says so when nothing is ticked', () => {
    app.goTo('files');
    app.addTexts(samples());
    app.goTo('earnings');
    expect(text()).toContain('Nothing is ticked yet');
    expect(text()).not.toContain('£1,664.25');
    // Only ask for support once there is something to be thankful for.
    expect(document.querySelector('.support')).toBeNull();
  });

  it('asks quietly for support under the results, with links that open in a new tab', () => {
    app.goTo('files');
    app.addTexts(samples());
    app.goTo('payers');
    tick('Fake Platform Inc');
    app.goTo('earnings');
    const card = document.querySelector('.support')!;
    expect(card.textContent).toContain('Did this help?');
    const links = [...card.querySelectorAll('a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      'https://github.com/sponsors/PSYEONE',
      'https://nowpayments.io/donation/psyeone',
      'https://github.com/PSYEONE/paypal-income-calculator/issues/new',
    ]);
    expect(links.every((a) => a.target === '_blank' && a.rel.includes('noopener'))).toBe(true);
  });

  it('shows a clear error for an unknown layout and will not move on with it', () => {
    app.goTo('files');
    app.addTexts([{ name: 'other.csv', text: fixtureText('other-layout.csv') }]);
    expect(text()).toContain('not in a PayPal layout this tool can read');
    expect(findButton('Next').disabled).toBe(true);
  });

  it('needs a second click to remove a file, and cancels if you move away', () => {
    app.goTo('files');
    app.addTexts([{ name: 'sample-a.csv', text: fixtureText('sample-a.csv') }]);
    const button = () => document.querySelector<HTMLButtonElement>('.file button')!;
    const label = () => button().querySelector('.swap span:not([aria-hidden])')!.textContent;
    expect(label()).toBe('Remove');

    button().click();
    expect(label()).toBe('Confirm');
    expect(button().classList.contains('armed')).toBe(true);
    expect(text()).toContain('sample-a.csv');

    button().dispatchEvent(new Event('mouseleave'));
    expect(label()).toBe('Remove');
    expect(button().classList.contains('armed')).toBe(false);

    button().click();
    button().click();
    expect(text()).not.toContain('sample-a.csv');
    expect(findButton('Next').disabled).toBe(true);
  });

  it('starts again only after a second click, and clears everything', () => {
    app.goTo('files');
    app.addTexts(samples());
    app.goTo('withdrawals');
    const again = () => document.querySelector<HTMLButtonElement>('.wiz-foot button:last-child')!;
    again().click();
    expect(title()).toBe('Money withdrawn to your card or bank');
    expect(again().classList.contains('armed')).toBe(true);
    again().click();
    expect(title()).toBe('Add your PayPal files');
    expect(text()).not.toContain('sample-a.csv');
  });

  describe('choosing what to total', () => {
    beforeEach(() => {
      app.goTo('files');
      app.addTexts(samples());
      app.goTo('payers');
      tick('Fake Platform Inc');
      app.goTo('earnings');
    });
    const headings = () => [...document.querySelectorAll('.year h3')].map((el) => el.firstChild?.textContent?.trim());

    it('starts with UK tax years and pounds, guessed from where the money was withdrawn', () => {
      expect((document.getElementById('period-choice') as HTMLSelectElement).value).toBe('tax');
      expect((document.getElementById('home-choice') as HTMLSelectElement).value).toBe('GBP');
      expect(headings()).toEqual(['2023-24', '2024-25', '2025-26']);
    });

    it('splits by calendar year', () => {
      choose('period-choice', 'calendar');
      expect(title()).toBe('Earnings by year');
      expect(headings()).toEqual(['2024', '2025']);
      expect(text()).toContain('This year is not over yet.');
      // The choice stays put on the next page.
      press('See withdrawals');
      expect(text()).toContain('Year');
      expect((document.getElementById('period-choice') as HTMLSelectElement).value).toBe('calendar');
    });

    it('totals any dates you choose, starting with everything in the files', () => {
      choose('period-choice', 'custom');
      expect(title()).toBe('Earnings for your dates');
      expect((document.getElementById('custom-from') as HTMLInputElement).value).toBe('2024-03-10');
      expect((document.getElementById('custom-to') as HTMLInputElement).value).toBe('2025-05-10');
      expect(headings()).toEqual(['Your dates']);
      expect(text()).toContain('US$2,910.00');

      choose('custom-from', '2024-04-06');
      choose('custom-to', '2025-04-05');
      expect(text()).toContain('US$2,100.00');
      expect(text()).toContain('£1,664.25 estimate');
      expect(text()).not.toContain('partly covered');
    });

    it('says so when the dates miss the files or are the wrong way round', () => {
      choose('period-choice', 'custom');
      choose('custom-from', '2020-01-01');
      choose('custom-to', '2020-12-31');
      expect(text()).toContain('None of your files cover these dates. Your files run from 10 Mar 2024 to 10 May 2025.');

      choose('custom-from', '2021-01-01');
      expect(text()).toContain('The "From" date is after the "To" date.');
    });

    it('shows another currency, without HMRC figures, which are only for pounds', () => {
      choose('home-choice', 'USD');
      expect(text()).not.toContain('HMRC');
      expect(text()).not.toContain('estimate');
      expect(text()).toContain('US$2,610.00'); // all of 2024: nothing to convert, so the total is exact
      expect(document.querySelector('.year')!.querySelectorAll('thead th')).toHaveLength(3);
    });

    it('starts on calendar years for anyone not working in pounds, until they pick', () => {
      choose('home-choice', 'USD');
      expect((document.getElementById('period-choice') as HTMLSelectElement).value).toBe('calendar');
      expect(title()).toBe('Earnings by year');
      choose('period-choice', 'tax');
      choose('home-choice', 'EUR');
      expect((document.getElementById('period-choice') as HTMLSelectElement).value).toBe('tax');
    });
  });

  it('draws the same welcome page and questions that the build writes into the HTML for search engines', () => {
    const words = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    const links = (el: Element) => [...el.querySelectorAll('a')].map((l) => [l.textContent, l.getAttribute('href'), l.getAttribute('target')]);
    const built = document.createElement('div');
    built.innerHTML = welcomeHtml();
    const drawn = document.querySelector('.wiz-body')!;
    expect(words(built.firstElementChild!)).toBe(words(drawn));
    expect(links(built)).toEqual(links(drawn));
    expect(drawn.querySelectorAll('.faq details')).toHaveLength(13);
    // One group, so only one answer is open at a time, in both copies.
    expect(new Set([...drawn.querySelectorAll('.faq details'), ...built.querySelectorAll('details')].map((d) => d.getAttribute('name')))).toEqual(new Set(['faq']));
    expect(readFileSync(resolve('index.html'), 'utf8')).toContain('<!-- welcome:');
  });

  it('never turns file contents into markup', () => {
    const evil = fixtureText('sample-a.csv').replace('Sam Fakename', '<img src=x onerror=alert(1)>');
    app.goTo('files');
    app.addTexts([{ name: 'evil.csv', text: evil }]);
    app.goTo('payers');
    expect(document.querySelector('img')).toBeNull();
    expect(text()).toContain('<img src=x');
  });
});
