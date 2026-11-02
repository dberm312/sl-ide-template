import type { ComponentType, Dispatch, ReactNode, SetStateAction } from 'react';

export type InchBox = readonly [x: number, y: number, width: number, height: number];
export type PageKind = 'cover' | 'content' | 'divider' | 'appendix' | 'flow';
export type DockPlace = 'top' | 'side';
export type Setter<T> = Dispatch<SetStateAction<T>>;
export interface PageProps {
  pageNumber?: number | string;
  appendixLabel?: string;
}
// Page-specific props are authored by each deck. The harness passes them through.
export type PageComponent = ComponentType<any>;
export interface FixedEntry {
  id: string;
  kind: Exclude<PageKind, 'flow'>;
  Component: PageComponent;
  title: string;
  props?: Record<string, unknown>;
}
export type MemoBlock = string | { p: string } | { h1: string } | { h2: string } | { h3: string }
  | { ul: string[] } | { ol: string[] }
  | { table: { head?: string[]; rows: string[][]; widths?: string[] } }
  | { callout: string } | { memohead: [string, string][] }
  | { exhibit: PageComponent; props?: Record<string, unknown> } | { pageBreak: true };
export interface FlowEntry { id: string; kind: 'flow'; blocks: MemoBlock[] }
export type DocumentEntry = FixedEntry | FlowEntry;
export type Span = [number, number];
export type BlockMeasure = { kind: 'break' }
  | { kind: 'lines'; space: number; h: number; lh: number; starts: number[]; confirms: Span[] }
  | { kind: 'items'; space: number; h: number; head: number; spans: Span[] }
  | { kind: 'heading' | 'keep'; space: number; h: number };
export interface Piece { i: number; part: Span | null }
export interface MemoPageProps extends PageProps {
  blocks: MemoBlock[]; metas: BlockMeasure[]; pieces: Piece[]; first: boolean;
}
export interface FlowPage {
  id: string; kind: 'flow'; Component: PageComponent; title: string; props: MemoPageProps;
}
export type RenderedPage = FixedEntry | FlowPage;
export interface DeckViewProps {
  slides: RenderedPage[]; pages: Map<string, number>; apx: Map<string, string>;
}
export interface RailProps extends DeckViewProps {
  place: DockPlace; open: boolean; setOpen: Setter<boolean>; width: number; setWidth: Setter<number>;
}
export interface DevBarProps extends RailProps { setPlace: Setter<DockPlace> }
export interface ToolProps extends DeckViewProps { onExit: () => void }
export interface DeckMeta {
  format?: 'slides' | 'memo'; deckTitle: string; author?: string; date?: string; pdfName?: string;
  mark?: { text: string; src?: never } | { src: string; ratio?: number; alt?: string; text?: never } | null;
  watermark?: string | null; wordBudget?: number; pageBudget?: number;
}
export interface Zones { title: InchBox; footer: InchBox; body?: InchBox; header?: InchBox }
export interface ShellProps extends PageProps {
  kind?: PageKind; title?: string; titleZone?: InchBox; titleTag?: { head: string; sub?: string };
  sources?: string; className?: string; children?: ReactNode;
}
