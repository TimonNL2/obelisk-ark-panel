/**
 * Catalog of commonly changed ARK settings shown in the "Game settings" form.
 * Values are stored per server in server.iniOverrides and written to the INI files
 * right before every start (ARK rewrites GameUserSettings.ini on shutdown, so writing
 * them at start time is the only reliable way to make them stick).
 *
 * type: number | bool | text. An empty value means "use the game default".
 */
const GUS = 'GameUserSettings.ini';
const GAME = 'Game.ini';
const SS = 'ServerSettings';
const GM = '/script/shootergame.shootergamemode';

const n = (category, key, label, placeholder, help = '', file = GUS, section = SS) => ({ category, key, label, type: 'number', placeholder, help, file, section });
const b = (category, key, label, help = '', file = GUS, section = SS) => ({ category, key, label, type: 'bool', help, file, section });

export const GAME_SETTINGS = [
  // General
  b('General', 'ServerPVE', 'PvE mode', 'Disable player vs player damage.'),
  b('General', 'ServerHardcore', 'Hardcore', 'Players restart at level 1 after death.'),
  b('General', 'AllowThirdPersonPlayer', 'Allow third person view'),
  b('General', 'ServerCrosshair', 'Show crosshair'),
  b('General', 'ShowMapPlayerLocation', 'Show player position on map'),
  b('General', 'AllowHitMarkers', 'Hit markers'),
  b('General', 'ShowFloatingDamageText', 'Floating damage numbers'),
  b('General', 'AllowFlyerCarryPvE', 'Flyers can carry in PvE'),
  b('General', 'PreventOfflinePvP', 'Offline raid protection'),
  b('General', 'AdminLogging', 'Log admin commands to chat'),
  n('General', 'DifficultyOffset', 'Difficulty offset', '1'),
  n('General', 'OverrideOfficialDifficulty', 'Override official difficulty', '5', '5 = max wild level 150.'),
  n('General', 'AutoSavePeriodMinutes', 'Autosave interval (minutes)', '15'),
  n('General', 'KickIdlePlayersPeriod', 'Kick idle players after (seconds)', '3600'),
  n('General', 'DayCycleSpeedScale', 'Day cycle speed', '1'),
  n('General', 'DayTimeSpeedScale', 'Daytime speed', '1'),
  n('General', 'NightTimeSpeedScale', 'Night speed', '1'),

  // Rates
  n('Rates', 'XPMultiplier', 'XP multiplier', '1'),
  n('Rates', 'TamingSpeedMultiplier', 'Taming speed', '1'),
  n('Rates', 'HarvestAmountMultiplier', 'Harvest amount', '1'),
  n('Rates', 'HarvestHealthMultiplier', 'Harvest health', '1'),
  n('Rates', 'ResourcesRespawnPeriodMultiplier', 'Resource respawn period', '1', 'Lower = faster respawn.'),
  n('Rates', 'ItemStackSizeMultiplier', 'Item stack size multiplier', '1'),
  n('Rates', 'SupplyCrateLootQualityMultiplier', 'Supply crate loot quality', '1', '', GAME, GM),
  n('Rates', 'FishingLootQualityMultiplier', 'Fishing loot quality', '1', '', GAME, GM),
  n('Rates', 'CropGrowthSpeedMultiplier', 'Crop growth speed', '1', '', GAME, GM),

  // Players
  n('Players', 'PlayerCharacterFoodDrainMultiplier', 'Food drain', '1'),
  n('Players', 'PlayerCharacterWaterDrainMultiplier', 'Water drain', '1'),
  n('Players', 'PlayerCharacterStaminaDrainMultiplier', 'Stamina drain', '1'),
  n('Players', 'PlayerCharacterHealthRecoveryMultiplier', 'Health recovery', '1'),
  n('Players', 'PlayerDamageMultiplier', 'Damage', '1'),
  n('Players', 'PlayerResistanceMultiplier', 'Resistance', '1', 'Lower = take less damage.'),
  b('Players', 'bAllowUnlimitedRespecs', 'Unlimited Mindwipe respecs', '', GAME, GM),
  b('Players', 'bAllowSpeedLeveling', 'Allow speed leveling (players)', '', GAME, GM),

  // Dinos
  n('Dinos', 'MaxTamedDinos', 'Max tamed dinos (server)', '5000'),
  n('Dinos', 'DinoCountMultiplier', 'Wild dino count', '1'),
  n('Dinos', 'DinoCharacterFoodDrainMultiplier', 'Dino food drain', '1'),
  n('Dinos', 'DinoCharacterStaminaDrainMultiplier', 'Dino stamina drain', '1'),
  n('Dinos', 'DinoCharacterHealthRecoveryMultiplier', 'Dino health recovery', '1'),
  n('Dinos', 'DinoDamageMultiplier', 'Wild dino damage', '1'),
  n('Dinos', 'DinoResistanceMultiplier', 'Wild dino resistance', '1'),
  b('Dinos', 'AllowRaidDinoFeeding', 'Allow raid dino (Titanosaur) feeding'),
  b('Dinos', 'bAllowFlyerSpeedLeveling', 'Allow flyer speed leveling', '', GAME, GM),

  // Breeding
  n('Breeding', 'MatingIntervalMultiplier', 'Mating interval', '1', 'Lower = breed more often.', GAME, GM),
  n('Breeding', 'MatingSpeedMultiplier', 'Mating speed', '1', '', GAME, GM),
  n('Breeding', 'EggHatchSpeedMultiplier', 'Egg hatch speed', '1', '', GAME, GM),
  n('Breeding', 'LayEggIntervalMultiplier', 'Egg laying interval', '1', '', GAME, GM),
  n('Breeding', 'BabyMatureSpeedMultiplier', 'Baby mature speed', '1', '', GAME, GM),
  n('Breeding', 'BabyFoodConsumptionSpeedMultiplier', 'Baby food consumption', '1', '', GAME, GM),
  n('Breeding', 'BabyCuddleIntervalMultiplier', 'Imprint cuddle interval', '1', 'Lower = cuddle more often.', GAME, GM),
  n('Breeding', 'BabyImprintAmountMultiplier', 'Imprint amount per cuddle', '1', '', GAME, GM),
  n('Breeding', 'BabyImprintingStatScaleMultiplier', 'Imprinting stat bonus', '1', '', GAME, GM),

  // Structures
  n('Structures', 'StructureResistanceMultiplier', 'Structure resistance', '1'),
  n('Structures', 'StructureDamageMultiplier', 'Structure damage', '1'),
  n('Structures', 'TheMaxStructuresInRange', 'Max structures in range', '10500'),
  n('Structures', 'StructurePickupTimeAfterPlacement', 'Pickup time after placement (s)', '30'),
  n('Structures', 'PvEStructureDecayPeriodMultiplier', 'PvE structure decay period', '1'),
  b('Structures', 'AlwaysAllowStructurePickup', 'Always allow structure pickup'),
  b('Structures', 'DisableStructureDecayPvE', 'Disable structure decay (PvE)'),
  b('Structures', 'AllowCaveBuildingPvE', 'Allow cave building (PvE)'),
  b('Structures', 'AllowCaveBuildingPvP', 'Allow cave building (PvP)'),
  b('Structures', 'EnableExtraStructurePreventionVolumes', 'Extra build prevention zones'),
  b('Structures', 'ForceAllStructureLocking', 'Lock all structures by default'),
  b('Structures', 'bDisableStructurePlacementCollision', 'Disable placement collision', '', GAME, GM),
  b('Structures', 'bAllowPlatformSaddleMultiFloors', 'Platform saddle multi-floors', '', GAME, GM),
];

export const INI_FILES = ['GameUserSettings.ini', 'Game.ini'];

/** Validate and normalise an overrides object coming from the UI. */
export function normaliseOverrides(input) {
  const out = {};
  for (const def of GAME_SETTINGS) {
    const raw = input?.[def.file]?.[def.section]?.[def.key];
    if (raw === undefined || raw === null || raw === '') continue;
    let value;
    if (def.type === 'bool') {
      if (raw === true || /^true$/i.test(String(raw))) value = 'True';
      else if (raw === false || /^false$/i.test(String(raw))) value = 'False';
      else continue;
    } else if (def.type === 'number') {
      const num = Number(raw);
      if (!Number.isFinite(num)) continue;
      value = String(num);
    } else {
      value = String(raw).replace(/[\r\n]/g, ' ');
    }
    out[def.file] ||= {};
    out[def.file][def.section] ||= {};
    out[def.file][def.section][def.key] = value;
  }
  return out;
}

/** List of [file, section, key] present in `prev` but not in `next`. */
export function removedKeys(prev, next) {
  const removed = [];
  for (const [file, sections] of Object.entries(prev || {})) {
    for (const [section, keys] of Object.entries(sections)) {
      for (const key of Object.keys(keys)) {
        if (next?.[file]?.[section]?.[key] === undefined) removed.push([file, section, key]);
      }
    }
  }
  return removed;
}
