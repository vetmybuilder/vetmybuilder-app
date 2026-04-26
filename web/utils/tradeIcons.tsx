// web/utils/tradeIcons.tsx
//
// Shared trade-name → lucide-icon mapping. Used by both the desktop
// tradesman profile and the mobile profile so they stay in sync.

import type { ElementType } from "react";
import {
  Bath,
  Building2,
  DoorOpen,
  Droplets,
  Fence,
  Flame,
  Hammer,
  HardHat,
  Home,
  Layers,
  Lightbulb,
  PaintBucket,
  Ruler,
  Shovel,
  Square,
  Sun,
  TreePine,
  Wind,
  Wrench,
  Zap,
} from "lucide-react";

export const TRADE_ICONS: Record<string, ElementType> = {
  "general builder": Hammer,
  "extension builder": Building2,
  "loft conversion": Home,
  "new build": Building2,
  "decorator": PaintBucket,
  "painter": PaintBucket,
  "painter & decorator": PaintBucket,
  "plasterer": Layers,
  "flooring specialist": Layers,
  "flooring": Layers,
  "tiler": Square,
  "bathroom fitter": Bath,
  "kitchen fitter": Wrench,
  "plumber": Droplets,
  "electrician": Zap,
  "handyman": Wrench,
  "roofer": Home,
  "external wall insulation": Wind,
  "insulation": Wind,
  "landscaper": TreePine,
  "gardener": TreePine,
  "carpenter": Ruler,
  "joiner": Ruler,
  "windows & doors": DoorOpen,
  "conservatory": Sun,
  "solar panels": Sun,
  "groundworks": Shovel,
  "demolition": HardHat,
  "scaffolding": HardHat,
  "fencing": Fence,
  "gas engineer": Flame,
  "heating engineer": Flame,
  "boiler installation": Flame,
  "lighting": Lightbulb,
};

export function tradeIconFor(label: string): ElementType {
  return TRADE_ICONS[label.toLowerCase()] ?? Hammer;
}
