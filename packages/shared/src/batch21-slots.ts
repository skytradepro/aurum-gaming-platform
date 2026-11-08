/** Reuse proven line math; each lobby cover is unique Hannibal-branded art. */
export type Batch21Template = 'fruit100' | 'fruit20' | 'genie' | 'coins' | 'hannibal';

export interface Batch21Slot {
  readonly id: string;
  readonly title: string;
  readonly template: Batch21Template;
  readonly hue: number;
  readonly assetFile: string;
}

export const BATCH21_SLOTS: readonly Batch21Slot[] = [
  { id: 'amigomonkeys', title: 'HANNIBAL 1000 Amigo Monkeys', template: 'fruit100', hue: 95, assetFile: 'a99d4920-821e-4dbd-bec8-48cbdfa9376f-d913f805-eaf0-46f9-bc34-bb5593b11441.jpg' },
  { id: 'wolves10k', title: "HANNIBAL 10,000 Wolves 10K Ways", template: 'fruit100', hue: 220, assetFile: '839376ee-bd6f-43f2-a009-0a058445175e-9d646db6-c3f2-4fe2-a801-6f109580d881.jpg' },
  { id: 'rush10kx', title: 'HANNIBAL 10000x Rush', template: 'fruit100', hue: 200, assetFile: '617195a5-5780-495e-ba7a-4bb434864a87-33bed791-e667-4921-8e89-8da7d2ac163d.jpg' },
  { id: 'nights10001', title: 'HANNIBAL 10,001 Nights', template: 'genie', hue: 280, assetFile: '421a036f-aeeb-4055-9d23-6af106dd68f1-affe7fd3-7c5d-4536-a318-3069833003a1.jpg' },
  { id: 'superhot100', title: 'HANNIBAL 100 Super Hot', template: 'fruit100', hue: 14, assetFile: '48f03e81-40bf-4c83-9973-185c40d2cba5-27734573-6774-452b-9a53-11fc1962f7e3.jpg' },
  { id: 'supericy100', title: 'HANNIBAL 100 Super Icy', template: 'fruit100', hue: 195, assetFile: 'd1e0def3-999a-473e-8ea1-332082661d9c-5b23b680-0007-482f-b09b-1c0c47cf1ad8.jpg' },
  { id: 'wonders10k', title: 'HANNIBAL 10,000 Wonders 10K Ways', template: 'genie', hue: 42, assetFile: 'd75b7463-58da-4421-9ac3-86abaff5faf4-d12e28b7-a495-471d-9e0e-484f0e102bfa.jpg' },
  { id: 'olympus1000', title: 'HANNIBAL 1000 Olympus Rivals', template: 'hannibal', hue: 35, assetFile: '81d86c20-8b4c-44a9-9bcb-541d66c3c920-8da5c661-3840-4b8e-a9e2-90ea34463eaf.jpg' },
  { id: 'winning10kn', title: 'HANNIBAL 10,000 Winning Nights', template: 'genie', hue: 300, assetFile: 'b2c8464d-820f-4cfc-9a99-6e4e6000e28e-106a3a10-5055-4a2e-b323-7692bfd3fc91.jpg' },
  { id: 'moongirls1000', title: 'HANNIBAL 1000 Moon Girls', template: 'fruit20', hue: 310, assetFile: '172a884c-3dd9-45b5-b4ba-2c336cf3e413-a4f9cd1f-fa87-4bb6-82c4-07e23ab0fc48.jpg' },
  { id: 'rush1000x', title: 'HANNIBAL 1000x Rush', template: 'fruit100', hue: 185, assetFile: '79927e45-c050-40b0-8ce8-b71cf0d3631b-c177a31d-60f9-44f8-8ac6-d2a45b44b1d5.jpg' },
  { id: 'artofgold100', title: 'HANNIBAL 100 Art of Gold', template: 'coins', hue: 48, assetFile: '894105aa-fad3-43bf-8225-26f0dc5f52d1-183761c2-9a82-43e0-9fb9-2cc60473d3ba.jpg' },
  { id: 'reelfish100', title: 'HANNIBAL 100 Golden Coins: Reel Fishing', template: 'coins', hue: 130, assetFile: 'ba773b90-7c47-4aaf-b7cf-ae1c3296faca-ae406289-c60c-4d61-8fda-e99852c02d73.jpg' },
  { id: 'winning1kn', title: 'HANNIBAL 1000 Winning Nights', template: 'genie', hue: 265, assetFile: 'ef983544-4114-4aff-a506-15d4f0b1cf0b-148402be-d4bd-4aea-bffa-b43c788de4fc.jpg' },
  { id: 'burningbrilliants', title: 'HANNIBAL 100 Burning Brilliants', template: 'fruit100', hue: 320, assetFile: '1399018b-1603-4c2e-8954-742a9883a6e6-d3387743-31a1-4797-8709-36660fadb7a5.jpg' },
  { id: 'dragonpearls15', title: "HANNIBAL 15 Dragon Pearls Hold & Win", template: 'hannibal', hue: 275, assetFile: '30002a13-1302-4405-9e3b-6d26b672d5b5-beff3367-906d-43b1-9069-2fb50013a254.jpg' },
  { id: 'spins1001', title: 'HANNIBAL 1001 Spins', template: 'genie', hue: 250, assetFile: '6cf8b7e3-6e95-4e7f-a7a7-02a8dcdd7b7c-8aa63684-1b75-488b-894d-39f75ea965e4.jpg' },
  { id: 'geniefortune1001', title: 'HANNIBAL 1001 Mystery Genie Fortunes', template: 'genie', hue: 290, assetFile: '78d32ade-af08-43c7-8438-88eb1256c28e-e01a1fde-aaff-47df-ae2c-ea2fbf0be975.jpg' },
  { id: 'burninghotbb', title: 'HANNIBAL 100 Burning Hot Buy Bonus', template: 'fruit100', hue: 120, assetFile: 'a9a7be28-6fca-4cf3-89c2-58f8a3dd60b2-144e8989-4d92-46df-ae89-f92fb033fada.jpg' },
  { id: 'artofgolddice', title: 'HANNIBAL 100 Art of Gold Dice Edition', template: 'fruit100', hue: 38, assetFile: 'e2ebbb35-8ec9-42a2-a702-083c2b7ca077-a6abafd3-04c8-4f8b-bbcf-3ffb62c44bdb.jpg' },
  { id: 'goldencoinsdice', title: 'HANNIBAL 100 Golden Coins Dice Edition', template: 'coins', hue: 45, assetFile: 'b4054dc6-a60e-4fcb-b03c-ff82b118511b-e6019bae-7a70-4795-b77c-bc4b04b7fea0.jpg' },
  { id: 'glossy10', title: '10 Glossy Hannibal', template: 'fruit20', hue: 15, assetFile: '21e794fb-image.png' },
  { id: 'jester10', title: '10 Jester Hannibal', template: 'fruit100', hue: 285, assetFile: 'c9323e8d-image.png' },
  { id: 'wild2', title: '2 Wild Hannibal', template: 'hannibal', hue: 28, assetFile: 'b33a502e-image.png' },
  { id: 'fruitata30', title: '30 Fruitata Hannibal', template: 'fruit100', hue: 110, assetFile: 'ef1f084a-image.png' },
  { id: 'ways2', title: '2 Ways Hannibal', template: 'coins', hue: 150, assetFile: '64a4bbbb-image.png' },
  { id: 'kings2', title: '2 Kings Hannibal', template: 'hannibal', hue: 40, assetFile: 'b45357c5-image.png' },
  { id: 'mafia', title: 'Mafia Hannibal', template: 'coins', hue: 30, assetFile: '453fc993-image.png' },
  { id: 'hunter3021', title: '3021 Hannibal Hunter', template: 'hannibal', hue: 20, assetFile: 'ed7d031b-image.png' },
] as const;

export const BATCH21_SLOT_IDS = BATCH21_SLOTS.map((s) => s.id);
export type Batch21SlotId = (typeof BATCH21_SLOTS)[number]['id'];

export function isBatch21SlotId(id: string): id is Batch21SlotId {
  return (BATCH21_SLOT_IDS as readonly string[]).includes(id);
}

export function batch21SlotById(id: string): Batch21Slot | undefined {
  return BATCH21_SLOTS.find((s) => s.id === id);
}
