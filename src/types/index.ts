/**
 * @file types/index.ts
 * تعريفات الأنواع المشتركة لمحرك توزيع الألواح
 */

import { GrainDirection } from '../utils/nesting.ts';
import type { GrainDirectionType, PartInput, SheetConfig, NestingResult } from '../utils/nesting.ts';

export type WoodSpecies = 'oak' | 'walnut' | 'birch' | 'melamine' | 'mdf';

export interface WoodSpeciesInfo {
  id: WoodSpecies;
  nameAr: string;
  nameEn: string;
  bgColor: string;
  grainColor: string;
  accent: string;
  defaultPrice: number;
}

export const WOOD_SPECIES: Record<WoodSpecies, WoodSpeciesInfo> = {
  oak: {
    id: 'oak',
    nameAr: 'خشب بلوط طبيعي (Natural Oak)',
    nameEn: 'Natural Oak',
    bgColor: '#dfc69f',
    grainColor: '#b89467',
    accent: '#b45309',
    defaultPrice: 180
  },
  walnut: {
    id: 'walnut',
    nameAr: 'جوز أمريكي داكن (American Walnut)',
    nameEn: 'American Walnut',
    bgColor: '#785338',
    grainColor: '#4d321d',
    accent: '#572d15',
    defaultPrice: 280
  },
  birch: {
    id: 'birch',
    nameAr: 'خشب بتولا روسي (Baltic Birch)',
    nameEn: 'Baltic Birch',
    bgColor: '#faedd2',
    grainColor: '#dfc699',
    accent: '#d97706',
    defaultPrice: 220
  },
  melamine: {
    id: 'melamine',
    nameAr: 'ميلامين أبيض ناصع (White Melamine)',
    nameEn: 'White Melamine',
    bgColor: '#f8fafc',
    grainColor: '#e2e8f0',
    accent: '#475569',
    defaultPrice: 130
  },
  mdf: {
    id: 'mdf',
    nameAr: 'MDF بيج خام (Raw MDF)',
    nameEn: 'Raw MDF',
    bgColor: '#cbb692',
    grainColor: '#ad956f',
    accent: '#78350f',
    defaultPrice: 110
  }
};



export const INITIAL_PARTS: PartInput[] = [
  {
    id: 'Door_1',
    name: 'باب دولاب علوي (رأسي)',
    width: 900,
    height: 450,
    count: 3,
    grain: GrainDirection.HEIGHT,
    color: '#FF0000',
    viewBox: '0 0 900 450',
    svgSnippet: `<g fill="none" stroke="#FF0000" stroke-width="2.5"><rect x="5" y="5" width="890" height="440" rx="8" fill="none" stroke="#FF0000" stroke-width="2.5"/><rect x="40" y="40" width="820" height="370" rx="6" fill="none" stroke="#FF0000" stroke-width="1.8" stroke-dasharray="10 5"/><circle cx="80" cy="225" r="18" fill="none" stroke="#FF0000" stroke-width="2.5"/></g>`
  },
  {
    id: 'Shelf_1',
    name: 'رف داخلي عريض (أفقي)',
    width: 850,
    height: 380,
    count: 4,
    grain: GrainDirection.WIDTH,
    color: '#FF0000',
    viewBox: '0 0 850 380',
    svgSnippet: `<g fill="none" stroke="#FF0000" stroke-width="2.5"><rect x="5" y="5" width="840" height="370" rx="4" fill="none" stroke="#FF0000" stroke-width="2.5"/><circle cx="60" cy="50" r="10" fill="none" stroke="#FF0000" stroke-width="2"/><circle cx="790" cy="50" r="10" fill="none" stroke="#FF0000" stroke-width="2"/><circle cx="60" cy="330" r="10" fill="none" stroke="#FF0000" stroke-width="2"/><circle cx="790" cy="330" r="10" fill="none" stroke="#FF0000" stroke-width="2"/></g>`
  },
  {
    id: 'Back_1',
    name: 'ظهر خزانة تقوية (حر)',
    width: 650,
    height: 500,
    count: 2,
    grain: GrainDirection.FREE,
    color: '#FF0000',
    viewBox: '0 0 650 500',
    svgSnippet: `<g fill="none" stroke="#FF0000" stroke-width="2.5"><path d="M 10,10 L 640,10 L 640,490 L 10,490 Z" fill="none" stroke="#FF0000" stroke-width="2.5"/><circle cx="325" cy="250" r="40" fill="none" stroke="#FF0000" stroke-width="2.5"/></g>`
  },
  {
    id: 'Drawer_Front',
    name: 'واجهة درج مظهرة (أفقي)',
    width: 600,
    height: 220,
    count: 3,
    grain: GrainDirection.WIDTH,
    color: '#FF0000',
    viewBox: '0 0 600 220',
    svgSnippet: `<g fill="none" stroke="#FF0000" stroke-width="2.5"><rect x="5" y="5" width="590" height="210" rx="14" fill="none" stroke="#FF0000" stroke-width="2.5"/><rect x="230" y="95" width="140" height="30" rx="15" fill="none" stroke="#FF0000" stroke-width="2"/></g>`
  },
  {
    id: 'Side_Divider',
    name: 'قاطع عمودي وسطي (رأسي)',
    width: 720,
    height: 400,
    count: 2,
    grain: GrainDirection.HEIGHT,
    color: '#FF0000',
    viewBox: '0 0 720 400',
    svgSnippet: `<g fill="none" stroke="#FF0000" stroke-width="2.5"><path d="M 10,10 L 710,10 L 710,390 L 10,390 Z" fill="none" stroke="#FF0000" stroke-width="2.5"/><rect x="340" y="30" width="40" height="120" rx="6" fill="none" stroke="#FF0000" stroke-width="2"/></g>`
  }
];
