import {
  batch21LineConfig,
  batch21SlotById,
  isBatch21SlotId,
  type Batch21SlotId,
  type Batch21Template,
} from '@aurum/shared';
import type { LineTheme } from '@/components/game/LineGame';

const TEMPLATE_UI: Record<
  Batch21Template,
  Pick<LineTheme, 'ns' | 'className' | 'folder' | 'files'>
> = {
  fruit100: {
    ns: 'powerHot',
    className: 'lg-power',
    folder: 'powerhot',
    files: ['cherry', 'lemon', 'orange', 'grapes', 'melon', 'dice', 'seven', 'chip', 'star', 'crown'],
  },
  fruit20: {
    ns: 'cherryParty',
    className: 'lg-cherry',
    folder: 'cherryparty',
    files: ['lemon', 'orange', 'plum', 'grapes', 'melon', 'bell', 'seven', 'cherry', 'wild', 'star'],
  },
  genie: {
    ns: 'genieLamp',
    className: 'lg-genie',
    folder: 'genielamp',
    files: ['J', 'Q', 'K', 'A', 'moon', 'scimitar', 'teapot', 'jewel', 'carpet', 'lamp', 'palace'],
  },
  coins: {
    ns: 'goldenCoins',
    className: 'lg-coins',
    folder: 'goldencoins',
    files: ['J', 'Q', 'K', 'A', 'coins', 'cash', 'goldbar', 'diamond', 'lamp', 'chest'],
  },
  hannibal: {
    ns: 'hannibal',
    className: 'lg-hannibal',
    folder: 'hannibal',
    files: ['J', 'Q', 'K', 'A', 'coins', 'cash', 'goldbar', 'diamond', 'lion', 'chest'],
  },
};

export function batch21LineTheme(id: Batch21SlotId): LineTheme {
  const slot = batch21SlotById(id)!;
  const ui = TEMPLATE_UI[slot.template];
  return {
    id,
    ...ui,
    title: slot.title,
    config: batch21LineConfig(id),
  };
}

export function tryBatch21LineTheme(id: string): LineTheme | null {
  if (!isBatch21SlotId(id)) return null;
  return batch21LineTheme(id);
}
