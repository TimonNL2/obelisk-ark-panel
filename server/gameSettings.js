/**
 * Catalog of ARK settings shown in the "Game settings" form. It covers what the
 * singleplayer / host-session settings menus expose, plus the common Game.ini extras.
 *
 * Values are stored per server in server.iniOverrides and written to the INI files
 * right before every start (ARK rewrites GameUserSettings.ini on shutdown, so writing
 * them at start time is the only reliable way to make them stick).
 *
 * type: number | bool. An empty value means "use the game default".
 * games: optional list of games the setting applies to (default: both).
 */
const GUS = 'GameUserSettings.ini';
const GAME = 'Game.ini';
const SS = 'ServerSettings';
const GM = '/script/shootergame.shootergamemode';

let category = 'General';
const cat = (name) => { category = name; };
const n = (key, label, placeholder, help = '', extra = {}) => ({ category, key, label, type: 'number', placeholder, help, file: GUS, section: SS, ...extra });
const b = (key, label, help = '', extra = {}) => ({ category, key, label, type: 'bool', help, file: GUS, section: SS, ...extra });
const gn = (key, label, placeholder, help = '', extra = {}) => n(key, label, placeholder, help, { file: GAME, section: GM, ...extra });
const gb = (key, label, help = '', extra = {}) => b(key, label, help, { file: GAME, section: GM, ...extra });
const ASA = { games: ['asa'] };

export const STATS = ['Health', 'Stamina', 'Torpidity', 'Oxygen', 'Food', 'Water', 'Temperature', 'Weight', 'Melee damage', 'Movement speed', 'Fortitude', 'Crafting speed'];
export const STAT_GROUPS = [
  { prefix: 'PerLevelStatsMultiplier_Player', label: 'Player' },
  { prefix: 'PerLevelStatsMultiplier_DinoTamed', label: 'Tamed' },
  { prefix: 'PerLevelStatsMultiplier_DinoTamed_Add', label: 'Tamed (on tame)' },
  { prefix: 'PerLevelStatsMultiplier_DinoTamed_Affinity', label: 'Tamed (affinity)' },
  { prefix: 'PerLevelStatsMultiplier_DinoWild', label: 'Wild' },
];

const list = [];
const add = (...items) => list.push(...items);

/* ------------------------------------------------------------------ General */
cat('General');
add(
  b('ServerPVE', 'PvE mode', 'Players cannot damage each other or each other\'s structures.'),
  b('ServerHardcore', 'Hardcore', 'Players restart at level 1 when they die.'),
  gb('bUseSingleplayerSettings', 'Use singleplayer balance', 'Applies the singleplayer balance tweaks (faster taming/breeding, etc.).'),
  n('DifficultyOffset', 'Difficulty offset', '1', 'Between 0 and 1.'),
  n('OverrideOfficialDifficulty', 'Override official difficulty', '5', '5 = wild dinos up to level 150, 10 = level 300.'),
  n('DayCycleSpeedScale', 'Day/night cycle speed', '1'),
  n('DayTimeSpeedScale', 'Daytime speed', '1'),
  n('NightTimeSpeedScale', 'Night speed', '1'),
  n('AutoSavePeriodMinutes', 'Autosave interval (minutes)', '15'),
  n('KickIdlePlayersPeriod', 'Kick idle players after (seconds)', '3600'),
  b('EnableIdlePlayerKick', 'Kick idle players', 'Uses the period above.'),
  b('DisableWeatherFog', 'Disable fog'),
  b('PreventDiseases', 'Disable diseases'),
  b('NonPermanentDiseases', 'Diseases cure on respawn'),
  b('RandomSupplyCratePoints', 'Random supply drop locations'),
  b('AllowCrateSpawnsOnTopOfStructures', 'Supply drops may land on structures'),
  gb('bDisableLootCrates', 'Disable supply drops'),
  gb('bAutoUnlockAllEngrams', 'Unlock all engrams'),
  gb('bShowCreativeMode', 'Show creative mode button', 'Admins can toggle creative mode from the pause menu.'),
  gb('bDisablePhotoMode', 'Disable photo mode'),
  gb('bUseCorpseLocator', 'Show corpse locator beam'),
  gb('bDisableGenesisMissions', 'Disable Genesis missions'),
);

/* ------------------------------------------------------------------ Interface & chat */
cat('Interface & chat');
add(
  b('AllowThirdPersonPlayer', 'Allow third person view'),
  b('ServerCrosshair', 'Show crosshair'),
  b('ShowMapPlayerLocation', 'Show own position on the map'),
  b('ServerForceNoHUD', 'Force HUD off'),
  b('AllowHitMarkers', 'Hit markers'),
  b('ShowFloatingDamageText', 'Floating damage numbers'),
  b('EnablePvPGamma', 'Allow gamma changes in PvP'),
  b('DisablePvEGamma', 'Disallow gamma changes in PvE'),
  b('globalVoiceChat', 'Global voice chat'),
  b('proximityChat', 'Proximity text chat'),
  b('alwaysNotifyPlayerJoined', 'Announce players joining'),
  b('alwaysNotifyPlayerLeft', 'Announce players leaving'),
  b('AdminLogging', 'Show admin commands in chat'),
  b('AllowHideDamageSourceFromLogs', 'Hide damage source in tribe logs'),
);

/* ------------------------------------------------------------------ Rates */
cat('Rates');
add(
  n('XPMultiplier', 'XP multiplier', '1'),
  n('TamingSpeedMultiplier', 'Taming speed', '1'),
  n('HarvestAmountMultiplier', 'Harvest amount', '1'),
  n('HarvestHealthMultiplier', 'Resource node health', '1', 'Higher = more hits per tree/rock.'),
  n('ResourcesRespawnPeriodMultiplier', 'Resource respawn time', '1', 'Lower = resources come back faster.'),
  n('ItemStackSizeMultiplier', 'Item stack size', '1', '', ASA),
  b('ClampResourceHarvestDamage', 'Clamp harvest damage', 'Limits resources gathered by high-damage tools/dinos.'),
  gn('PlayerHarvestingDamageMultiplier', 'Player harvesting damage', '1'),
  gn('DinoHarvestingDamageMultiplier', 'Dino harvesting damage', '3.2'),
  gn('SupplyCrateLootQualityMultiplier', 'Supply crate loot quality', '1'),
  gn('FishingLootQualityMultiplier', 'Fishing loot quality', '1'),
  gn('CropGrowthSpeedMultiplier', 'Crop growth speed', '1'),
  gn('CropDecaySpeedMultiplier', 'Crop decay speed', '1'),
  gn('PoopIntervalMultiplier', 'Poop interval', '1'),
  gn('HairGrowthSpeedMultiplier', 'Hair growth speed', '1'),
  gn('GlobalSpoilingTimeMultiplier', 'Food spoil time', '1', 'Higher = food lasts longer.'),
  gn('GlobalItemDecompositionTimeMultiplier', 'Dropped item lifetime', '1'),
  gn('GlobalCorpseDecompositionTimeMultiplier', 'Corpse lifetime', '1'),
  gn('UseCorpseLifeSpanMultiplier', 'Harvested corpse lifetime', '1'),
  gn('FuelConsumptionIntervalMultiplier', 'Fuel lasts', '1', 'Higher = fuel lasts longer.'),
  gn('CustomRecipeEffectivenessMultiplier', 'Custom recipe effectiveness', '1'),
  gn('CustomRecipeSkillMultiplier', 'Custom recipe skill bonus', '1'),
  gn('CraftingSkillBonusMultiplier', 'Crafting skill bonus', '1'),
  gn('ResourceNoReplenishRadiusPlayers', 'No-respawn radius around players', '1'),
  gn('ResourceNoReplenishRadiusStructures', 'No-respawn radius around structures', '1'),
);

/* ------------------------------------------------------------------ Experience */
cat('Experience');
add(
  gn('GenericXPMultiplier', 'Generic XP', '1'),
  gn('HarvestXPMultiplier', 'Harvest XP', '1'),
  gn('CraftXPMultiplier', 'Crafting XP', '1'),
  gn('KillXPMultiplier', 'Kill XP', '1'),
  gn('SpecialXPMultiplier', 'Special XP', '1'),
  gn('ExplorerNoteXPMultiplier', 'Explorer note XP', '1'),
  gn('BossKillXPMultiplier', 'Boss kill XP', '1'),
  gn('OverrideMaxExperiencePointsPlayer', 'Max player XP', '', 'Raise to allow higher player levels (needs level overrides).'),
  gn('OverrideMaxExperiencePointsDino', 'Max dino XP', ''),
  gb('bAllowUnlimitedRespecs', 'Unlimited Mindwipe respecs'),
);

/* ------------------------------------------------------------------ Players */
cat('Players');
add(
  n('PlayerDamageMultiplier', 'Player damage', '1'),
  n('PlayerResistanceMultiplier', 'Player resistance', '1', 'Lower = players take less damage.'),
  n('PlayerCharacterFoodDrainMultiplier', 'Food drain', '1'),
  n('PlayerCharacterWaterDrainMultiplier', 'Water drain', '1'),
  n('PlayerCharacterStaminaDrainMultiplier', 'Stamina drain', '1'),
  n('PlayerCharacterHealthRecoveryMultiplier', 'Health recovery', '1'),
  n('OxygenSwimSpeedStatMultiplier', 'Oxygen swim speed bonus', '1'),
  n('ImplantSuicideCD', 'Respawn (suicide) cooldown (s)', '28800'),
  gb('bAllowSpeedLeveling', 'Allow speed leveling (players)'),
  gn('MaxFallSpeedMultiplier', 'Max fall speed', '1'),
  gb('bIncreasePvPRespawnInterval', 'Longer PvP respawn timer'),
  gb('bDisableFriendlyFire', 'Disable friendly fire (PvP)'),
  gb('bPvEDisableFriendlyFire', 'Disable friendly fire (PvE)'),
);

/* ------------------------------------------------------------------ Dinos */
cat('Dinos');
add(
  n('DinoCountMultiplier', 'Wild dino count', '1'),
  n('DinoDamageMultiplier', 'Wild dino damage', '1'),
  n('DinoResistanceMultiplier', 'Wild dino resistance', '1'),
  n('TamedDinoDamageMultiplier', 'Tamed dino damage', '1'),
  n('TamedDinoResistanceMultiplier', 'Tamed dino resistance', '1'),
  n('DinoCharacterFoodDrainMultiplier', 'Dino food drain', '1'),
  n('DinoCharacterStaminaDrainMultiplier', 'Dino stamina drain', '1'),
  n('DinoCharacterHealthRecoveryMultiplier', 'Dino health recovery', '1'),
  gn('TamedDinoCharacterFoodDrainMultiplier', 'Tamed dino food drain', '1'),
  gn('WildDinoCharacterFoodDrainMultiplier', 'Wild dino food drain', '1', 'Affects taming speed with food.'),
  gn('TamedDinoTorporDrainMultiplier', 'Tamed dino torpor drain', '1'),
  gn('WildDinoTorporDrainMultiplier', 'Wild dino torpor drain', '1', 'Lower = sleeping dinos stay down longer.'),
  gn('PassiveTameIntervalMultiplier', 'Passive tame interval', '1'),
  gn('DinoTurretDamageMultiplier', 'Turret damage to dinos', '1'),
  n('MaxTamedDinos', 'Max tamed dinos (server)', '5000'),
  n('MaxPersonalTamedDinos', 'Max tamed dinos per tribe', '0', '0 = no limit.'),
  n('PersonalTamedDinosSaddleStructureCost', 'Platform saddle tame cost', '0'),
  b('AllowFlyerCarryPvE', 'Flyers can carry in PvE'),
  b('AllowFlyingStaminaRecovery', 'Flyers recover stamina while flying'),
  b('ForceFlyerExplosives', 'Allow flyers with C4'),
  b('AllowRaidDinoFeeding', 'Allow Titanosaur feeding'),
  n('RaidDinoCharacterFoodDrainMultiplier', 'Raid dino food drain', '1'),
  b('DisableDinoDecayPvE', 'Disable dino decay (PvE)'),
  n('PvEDinoDecayPeriodMultiplier', 'PvE dino decay period', '1'),
  b('AutoDestroyDecayedDinos', 'Destroy decayed dinos'),
  b('PreventMateBoost', 'Disable mate boost'),
  n('ServerAutoForceRespawnWildDinosInterval', 'Wild dino wipe interval (s)', '0', '0 = never.'),
  gb('bAllowFlyerSpeedLeveling', 'Allow flyer speed leveling'),
  gb('bDisableDinoRiding', 'Disable dino riding'),
  gb('bDisableDinoTaming', 'Disable taming'),
  gb('bAllowUnclaimDinos', 'Allow unclaiming dinos'),
  gb('bFlyerPlatformAllowUnalignedDinoBasing', 'Allow unaligned dinos on flyer platforms'),
  gb('bPassiveDefensesDamageRiderlessDinos', 'Spikes damage riderless dinos'),
);

/* ------------------------------------------------------------------ Breeding */
cat('Breeding');
add(
  gn('MatingIntervalMultiplier', 'Mating interval', '1', 'Lower = breed more often.'),
  gn('MatingSpeedMultiplier', 'Mating speed', '1'),
  gn('EggHatchSpeedMultiplier', 'Egg hatch speed', '1'),
  gn('LayEggIntervalMultiplier', 'Egg laying interval', '1'),
  gn('BabyMatureSpeedMultiplier', 'Baby mature speed', '1'),
  gn('BabyFoodConsumptionSpeedMultiplier', 'Baby food consumption', '1'),
  gn('BabyCuddleIntervalMultiplier', 'Imprint cuddle interval', '1', 'Lower = cuddle more often.'),
  gn('BabyCuddleGracePeriodMultiplier', 'Cuddle grace period', '1'),
  gn('BabyCuddleLoseImprintQualitySpeedMultiplier', 'Imprint loss when late', '1'),
  gn('BabyImprintAmountMultiplier', 'Imprint per cuddle', '1'),
  gn('BabyImprintingStatScaleMultiplier', 'Imprinting stat bonus', '1'),
  b('AllowAnyoneBabyImprintCuddle', 'Anyone can imprint', 'Not only the person who claimed the baby.'),
  b('DisableImprintDinoBuff', 'Disable imprint rider buff'),
);

/* ------------------------------------------------------------------ Structures */
cat('Structures');
add(
  n('StructureResistanceMultiplier', 'Structure resistance', '1'),
  n('StructureDamageMultiplier', 'Structure damage', '1'),
  n('TheMaxStructuresInRange', 'Max structures in range', '10500'),
  n('PerPlatformMaxStructuresMultiplier', 'Structures per platform', '1'),
  n('PlatformSaddleBuildAreaBoundsMultiplier', 'Platform build area', '1'),
  n('MaxPlatformSaddleStructureLimit', 'Max platform saddle structures', '75'),
  n('StructurePickupTimeAfterPlacement', 'Pickup window after placing (s)', '30'),
  n('StructurePickupHoldDuration', 'Pickup hold time (s)', '0.5'),
  b('AlwaysAllowStructurePickup', 'Always allow pickup'),
  n('StructurePreventResourceRadiusMultiplier', 'Resource block radius around structures', '1'),
  b('DisableStructureDecayPvE', 'Disable structure decay (PvE)'),
  n('PvEStructureDecayPeriodMultiplier', 'PvE structure decay period', '1'),
  n('AutoDestroyOldStructuresMultiplier', 'Auto-destroy old structures', '0', '0 = off.'),
  b('OnlyAutoDestroyCoreStructures', 'Only auto-destroy core structures'),
  b('OnlyDecayUnsnappedCoreStructures', 'Only decay unsnapped core structures'),
  b('FastDecayUnsnappedCoreStructures', 'Fast-decay unsnapped core structures'),
  b('DestroyUnconnectedWaterPipes', 'Destroy unconnected water pipes'),
  b('AllowCaveBuildingPvE', 'Allow cave building (PvE)'),
  b('AllowCaveBuildingPvP', 'Allow cave building (PvP)'),
  b('EnableExtraStructurePreventionVolumes', 'Extra no-build zones'),
  b('OverrideStructurePlatformPrevention', 'Allow turrets on platforms'),
  b('ForceAllStructureLocking', 'Lock all structures by default'),
  b('AllowIntegratedSPlusStructures', 'S+ structures', '', ASA),
  b('AllowMultipleAttachedC4', 'Allow multiple C4 per object'),
  gb('bDisableStructurePlacementCollision', 'Disable placement collision'),
  gb('bAllowPlatformSaddleMultiFloors', 'Multiple floors on platform saddles'),
  gb('bLimitTurretsInRange', 'Limit turrets in range'),
  gn('LimitTurretsNum', 'Max turrets in range', '100'),
  gn('LimitTurretsRange', 'Turret limit range', '10000'),
  gn('PvPZoneStructureDamageMultiplier', 'Structure damage near spawns', '6'),
);

/* ------------------------------------------------------------------ Tribes & PvP */
cat('Tribes & PvP');
add(
  gn('MaxNumberOfPlayersInTribe', 'Max players per tribe', '0', '0 = no limit.'),
  gn('MaxAlliancesPerTribe', 'Max alliances per tribe', ''),
  gn('MaxTribesPerAlliance', 'Max tribes per alliance', ''),
  n('MaxTribeLogs', 'Tribe log entries', '400'),
  b('PreventTribeAlliances', 'Disable alliances'),
  gn('TribeSlotReuseCooldown', 'Tribe slot cooldown (s)', '0'),
  b('PreventOfflinePvP', 'Offline raid protection (ORP)'),
  n('PreventOfflinePvPInterval', 'ORP delay after logout (s)', '900'),
  gb('bAutoPvETimer', 'Automatic PvE/PvP timer'),
);

/* ------------------------------------------------------------------ Transfers */
cat('Transfers');
add(
  b('NoTributeDownloads', 'Disable all downloads'),
  b('PreventDownloadSurvivors', 'Block survivor downloads'),
  b('PreventDownloadItems', 'Block item downloads'),
  b('PreventDownloadDinos', 'Block dino downloads'),
  b('PreventUploadSurvivors', 'Block survivor uploads'),
  b('PreventUploadItems', 'Block item uploads'),
  b('PreventUploadDinos', 'Block dino uploads'),
  b('CrossARKAllowForeignDinoDownloads', 'Allow dinos from other maps'),
  n('MaxTributeDinos', 'Max uploaded dinos', '20'),
  n('MaxTributeItems', 'Max uploaded items', '50'),
  n('TributeItemExpirationSeconds', 'Uploaded item expiry (s)', '86400'),
  n('TributeDinoExpirationSeconds', 'Uploaded dino expiry (s)', '86400'),
  n('TributeCharacterExpirationSeconds', 'Uploaded survivor expiry (s)', '0'),
);

/* ------------------------------------------------------------------ Stats per level */
for (const g of STAT_GROUPS) {
  STATS.forEach((stat, i) => {
    list.push({
      category: 'Stats per level',
      key: `${g.prefix}[${i}]`,
      label: `${g.label}: ${stat}`,
      type: 'number',
      placeholder: '1',
      help: '',
      file: GAME,
      section: GM,
      matrix: { group: g.prefix, stat: i },
    });
  });
}

export const GAME_SETTINGS = list;

export const INI_FILES = ['GameUserSettings.ini', 'Game.ini'];

/** Presets the UI can apply (values are merged into the form, not saved directly). */
export const PRESETS = [
  {
    id: 'official',
    label: 'Official rates',
    description: 'Clears all rate, XP and breeding values.',
    clear: ['Rates', 'Experience', 'Breeding'],
    values: {},
  },
  ...[2, 3, 5, 10].map((x) => ({
    id: `x${x}`,
    label: `${x}x boosted`,
    description: `${x}x XP, taming, harvesting and breeding.`,
    values: {
      XPMultiplier: x, TamingSpeedMultiplier: x, HarvestAmountMultiplier: x,
      EggHatchSpeedMultiplier: x, BabyMatureSpeedMultiplier: x, MatingSpeedMultiplier: x,
      MatingIntervalMultiplier: +(1 / x).toFixed(3), BabyCuddleIntervalMultiplier: +(1 / x).toFixed(3),
      LayEggIntervalMultiplier: +(1 / x).toFixed(3), CropGrowthSpeedMultiplier: x,
    },
  })),
  {
    id: 'singleplayer',
    label: 'Singleplayer feel',
    description: 'Singleplayer balance, generous imprinting and no structure decay.',
    values: {
      bUseSingleplayerSettings: true, AllowAnyoneBabyImprintCuddle: true, BabyImprintAmountMultiplier: 2,
      DisableStructureDecayPvE: true, DisableDinoDecayPvE: true, AlwaysAllowStructurePickup: true, ShowMapPlayerLocation: true,
    },
  },
];

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
    } else {
      const num = Number(raw);
      if (!Number.isFinite(num)) continue;
      value = String(num);
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
