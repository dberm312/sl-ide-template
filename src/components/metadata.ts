import { META as deckMeta, ZONES as deckZones, rich as parseRich } from '../deck/content.js';
import type { DeckMeta, Zones } from './types';

// Deck content stays plain JavaScript, including decks created before TypeScript.
// This boundary describes the shared contract without requiring deck migrations.
export const META = deckMeta as DeckMeta;
export const ZONES = deckZones as unknown as Zones;
export const rich: (text: string) => { text: string; bold: boolean }[] = parseRich;
