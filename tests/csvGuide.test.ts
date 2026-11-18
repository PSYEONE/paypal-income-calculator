// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CSV_PAGE, csvGuideHtml } from '../src/ui/csvGuide';
import { GUIDE_STEP_TEXT } from '../src/ui/guideText';
import { GUIDE_STEPS } from '../src/ui/guide';
import { QUESTIONS } from '../src/ui/welcome';

describe('the PayPal CSV guide page', () => {
  const page = document.createElement('div');
  page.innerHTML = csvGuideHtml();

  it('has every step, in order, with its picture', () => {
    const steps = [...page.querySelectorAll('ol.guide > li')];
    expect(steps.map((li) => li.querySelector('strong')!.textContent)).toEqual(GUIDE_STEP_TEXT.map((s) => s.title));
    for (const s of GUIDE_STEP_TEXT.filter((s) => s.image)) {
      const img = page.querySelector(`img[src="/src/ui/guide/${s.image!.file}"]`)!;
      expect(img.getAttribute('alt')).toBe(s.image!.alt);
      expect(existsSync(resolve('src/ui/guide', s.image!.file))).toBe(true);
    }
  });

  it('explains what a CSV file is, and ends by pointing to the calculator', () => {
    expect([...page.querySelectorAll('h2')].map((x) => x.textContent)).toContain('What is a CSV file?');
    const button = page.querySelector('.cta a')!;
    expect(button.textContent).toBe('Go to the income calculator');
    expect(button.getAttribute('href')).toBe('/');
    expect(button.hasAttribute('target')).toBe(false);
    expect(page.textContent).toContain(CSV_PAGE.cta.text);
  });

  it('uses the same steps and pictures as the app', () => {
    expect(GUIDE_STEPS.map((s) => [s.title, s.detail])).toEqual(GUIDE_STEP_TEXT.map((s) => [s.title, s.detail]));
    expect(GUIDE_STEPS.filter((s) => s.image)).toHaveLength(GUIDE_STEP_TEXT.filter((s) => s.image).length);
  });

  it('is linked from the welcome page and listed for search engines', () => {
    const answer = QUESTIONS.find((x) => x.q.includes('CSV'))!.a;
    expect(answer).toContainEqual({ text: 'step-by-step guide', href: '/paypal-csv' });
    expect(readFileSync(resolve('public/sitemap.xml'), 'utf8')).toContain('<loc>https://gigincome.app/paypal-csv</loc>');
    expect(readFileSync(resolve('paypal-csv.html'), 'utf8')).toContain('<!-- csv-guide:');
  });
});
