// The words each kind of business uses for the three open stages of its leads board (the stages between "New" and "Won"). Plain data.
// An industry changes the WORDS, never the way the board works: the same three stages, in the same places. Won and Lost are left as they
// are. An industry with no entry here (or "general" and "other") keeps the standard words.

/** The names for the three open stages, left to right: where an enquiry starts, once someone has been in touch, and once a price or plan has been offered. */
export type OpenStageNames = readonly [string, string, string];

export const INDUSTRY_PIPELINE_PRESETS: Readonly<Record<string, OpenStageNames>> = {
  hotel_resort: ['New enquiry', 'Called', 'Rate sent'],
  restaurant_cafe: ['New enquiry', 'Called', 'Menu or quote sent'],
  real_estate: ['New enquiry', 'Called', 'Site visit planned'],
  clinic: ['New enquiry', 'Called', 'Appointment offered'],
  education: ['New enquiry', 'Called', 'Visit or demo planned'],
  services: ['New enquiry', 'Called', 'Quote sent'],
  retail: ['New enquiry', 'Called', 'Quote sent'],
  travel_agent: ['New enquiry', 'Called', 'Itinerary sent'],
  wedding_planner: ['New enquiry', 'Called', 'Proposal sent'],
  car_dealer: ['New enquiry', 'Called', 'Test drive planned'],
  auto_service: ['New enquiry', 'Called', 'Estimate sent'],
  salon_spa: ['New enquiry', 'Called', 'Booking offered'],
  gym_fitness: ['New enquiry', 'Called', 'Trial planned'],
};

/** The standard words, as every business starts with them. */
export const STANDARD_OPEN_STAGE_NAMES: OpenStageNames = ['New', 'Contacted', 'Quoted'];

export interface StageToRename {
  stageId: string;
  from: string;
  to: string;
}

export interface StagePresetPlan {
  /** The stages that still have the standard word and will get the industry's. */
  rename: StageToRename[];
  /** The stages the owner has already changed, which are left exactly as they are. */
  leftAlone: string[];
}

/**
 * Works out what applying an industry's words would do. Only an open stage that still has the standard word in its place is renamed; a
 * stage the owner has renamed, added or moved is never touched, and nothing is added or removed. Pure: no database.
 */
export function planStagePreset(
  industryId: string,
  openStages: ReadonlyArray<{ id: string; name: string }>,
): StagePresetPlan {
  const presetNames = INDUSTRY_PIPELINE_PRESETS[industryId];
  const plan: StagePresetPlan = { rename: [], leftAlone: [] };
  if (!presetNames) return plan;
  const takenNames = new Set(openStages.map((stage) => stage.name.toLowerCase()));
  for (const [position, standardName] of STANDARD_OPEN_STAGE_NAMES.entries()) {
    const stage = openStages[position];
    const presetName = presetNames[position]!;
    if (!stage) continue;
    if (stage.name === presetName) continue; // already the industry's word
    // Left alone: the owner changed it, or the new word is already used by another stage
    if (stage.name !== standardName || takenNames.has(presetName.toLowerCase())) {
      plan.leftAlone.push(stage.name);
      continue;
    }
    plan.rename.push({ stageId: stage.id, from: stage.name, to: presetName });
  }
  return plan;
}
