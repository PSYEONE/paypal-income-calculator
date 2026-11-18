// The guide steps with their pictures, for the app. The words are in guideText.ts.

import { GUIDE_STEP_TEXT, type GuideStepText } from './guideText';
import reportsList from './guide/reports-list.png';
import createReport from './guide/create-report.png';
import formatAndDates from './guide/format-and-dates.png';
import download from './guide/download.png';

export { GUIDE_INTRO, GUIDE_TIPS } from './guideText';

const PICTURES: Record<string, string> = {
  'reports-list.png': reportsList,
  'create-report.png': createReport,
  'format-and-dates.png': formatAndDates,
  'download.png': download,
};

export interface GuideStep extends Omit<GuideStepText, 'image'> {
  /** A screenshot. Width and height are the picture's real size in pixels. */
  image?: { src: string; alt: string; width: number; height: number };
}

export const GUIDE_STEPS: GuideStep[] = GUIDE_STEP_TEXT.map(({ image, ...step }) => {
  if (!image) return step;
  const src = PICTURES[image.file];
  if (!src) throw new Error(`guide.ts is missing the picture ${image.file}`);
  return { ...step, image: { src, alt: image.alt, width: image.width, height: image.height } };
});
