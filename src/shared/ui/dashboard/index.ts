/**
 * @module shared/ui/dashboard
 * @description Barrel for the dashboard design kit.
 * @owner Ficium Engineering
 */

export { default as Hero, HeroButton, GradText, type HeroStat } from './Hero'
export { default as LineChart, type ChartPoint } from './LineChart'
export {
  SectionHead, Panel, PanelHead, HoverCard, CardIcon,
  StatMini, Feed, FeedItem, DarkCallout,
  Tag, statusTone, ProgressBar, SkeletonBlock,
} from './kit'
export { default as Reveal } from '../motion/Reveal'
export { default as CountUp } from '../motion/CountUp'
