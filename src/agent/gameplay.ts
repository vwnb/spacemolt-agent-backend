import { z } from "zod";
import type { SpaceMoltClient } from "../spacemolt/client.js";

const none = z.object({}).strict().default({});
const text = z.string().min(1);
const int = z.number().int();
const posInt = int.positive();
const nonNegInt = int.min(0);
const bool = z.boolean();
const idArg = z.object({ id: text }).strict();
const targetArg = z.object({ target: text }).strict();
const infoArg = z.object({
  id: text.optional(),
  limit: posInt.max(100).optional(),
  offset: nonNegInt.optional(),
}).strict();
const notesArg = z.object({ page: posInt.optional(), page_size: posInt.max(100).optional() }).strict();
const notificationsArg = z.object({
  clear: bool.optional(),
  limit: posInt.max(100).optional(),
  types: z.array(z.enum(["chat", "combat", "trade", "market", "crafting", "observation", "system"])).max(7).optional(),
}).strict();
const itemQuantity = z.object({ item_id: text, quantity: posInt }).strict();
const itemQuantities = z.array(itemQuantity).max(50);
const jettisonItems = z.array(itemQuantity).max(100);
const shipmentArg = z.object({
  shipment_id: text.optional(),
  package_id: text.optional(),
}).strict().refine((value) => Boolean(value.shipment_id || value.package_id), "shipment_id or package_id is required");

type ActionSpec = {
  schema: z.ZodTypeAny;
  argsText: string;
  use: string;
};

function spec(schema: z.ZodTypeAny, argsText: string, use: string): ActionSpec {
  return { schema, argsText, use };
}

const shipArg = z.object({ id: text.optional() }).strict();
const mapArg = z.object({ system_id: text.optional() }).strict();
const searchSystemsArg = z.object({ text: text }).strict();
const guideArg = z.object({
  id: z.enum(["miner", "trader", "pirate-hunter", "boarding", "explorer", "base-builder", "drones", "fuel", "crafting"]).optional(),
}).strict();
const versionArg = z.object({
  id: text.optional(),
  text: text.optional(),
  page: posInt.optional(),
  count: posInt.max(20).optional(),
}).strict();
const helpArg = z.object({ topic: text.optional() }).strict();
const refuelArg = z.object({
  id: text.optional(),
  quantity: posInt.optional(),
  target: text.optional(),
}).strict();
const repairArg = refuelArg;
const scanArg = z.object({ id: text, mode: z.literal("cargo").optional() }).strict();
const buyArg = z.object({
  id: text,
  quantity: posInt,
  auto_list: bool.optional(),
  deliver_to: z.enum(["cargo", "storage"]).optional(),
}).strict();
const sellArg = z.object({
  id: text,
  quantity: posInt,
  auto_list: bool.optional(),
}).strict();
const jettisonArg = z.object({
  id: text.optional(),
  quantity: posInt.optional(),
  items: jettisonItems.optional(),
}).strict().refine(
  (value) => (value.id !== undefined || value.quantity !== undefined) !== (value.items !== undefined),
  "Use item_id/quantity or items, not both",
);

const cloakArg = z.object({ enable: bool.optional(), quantity: int.min(0).max(1).optional() }).strict();
const stanceArg = z.object({
  id: z.enum(["fire", "evade", "brace", "flee", "board"]),
  target: text.optional(),
  marines: posInt.optional(),
  intent: z.enum(["capture", "plunder"]).optional(),
}).strict();
const defaultStanceArg = z.object({ id: z.enum(["auto", "fire", "evade", "brace", "flee"]) }).strict();
const battleLogArg = z.object({
  id: text,
  tick_start: nonNegInt.optional(),
  tick_end: nonNegInt.optional(),
  limit: posInt.max(200).optional(),
}).strict();
const reloadArg = z.object({
  id: text.optional(),
  target: text.optional(),
  weapons: z.array(z.object({
    weapon_instance_id: text,
    ammo_item_id: text.optional(),
  }).strict()).max(50).optional(),
}).strict();
const arenaChallengeArg = z.object({ id: text, max_side_size: nonNegInt.optional() }).strict();

const factionCreateArg = z.object({
  id: z.string().length(4),
  text: text,
}).strict();
const factionListArg = z.object({ limit: posInt.optional(), offset: nonNegInt.optional() }).strict();
const factionTextArg = z.object({ id: text, text: text.optional() }).strict();
const factionMoveArg = z.object({ x: z.number(), y: z.number() }).strict();
const factionPrepayArg = z.object({ amount: posInt }).strict();
const permissionsArg = z.record(z.unknown()).optional();
const createRoleArg = z.object({
  name: text,
  priority: int,
  permissions: permissionsArg,
}).strict();
const editRoleArg = z.object({
  role_id: text,
  name: text.optional(),
  permissions: permissionsArg,
}).strict();
const promoteArg = z.object({
  player_id: text,
  role_id: z.enum(["recruit", "member", "officer", "leader"]),
}).strict();
const factionEditArg = z.object({
  charter: text.optional(),
  description: text.optional(),
  primary_color: text.optional(),
  secondary_color: text.optional(),
  ally_battle_opt_out: bool.optional(),
  ally_facility_access: bool.optional(),
  ally_fuel_access: bool.optional(),
  ally_intel_opt_out: bool.optional(),
  ally_shipyard_access: bool.optional(),
}).strict();
const writeRoomArg = z.object({
  room_id: text.optional(),
  name: text.optional(),
  description: text.optional(),
  access: z.enum(["public", "members", "officers"]).optional(),
}).strict();
const objectiveSchema = z.object({
  type: text,
  description: text,
  quantity: posInt.optional(),
  item_id: text.optional(),
  system_id: text.optional(),
  target_base_id: text.optional(),
  target_id: text.optional(),
  pirate_tier: text.optional(),
}).strict();
const rewardsSchema = z.object({
  credits: nonNegInt.optional(),
  items: z.record(posInt).optional(),
}).strict().optional();
const postMissionArg = z.object({
  title: text,
  description: text,
  type: text,
  objectives: z.array(objectiveSchema).min(1).max(10),
  rewards: rewardsSchema,
  giver_name: text.optional(),
  giver_title: text.optional(),
  expiration_hours: int.min(1).max(720).optional(),
  dialog: z.record(text).optional(),
  triggers: z.array(text).optional(),
}).strict();
const factionOrderArg = z.object({
  item_id: text.optional(),
  quantity: posInt.optional(),
  price_each: posInt.optional(),
  bucket: text.optional(),
  private: bool.optional(),
  orders: z.array(z.object({
    item_id: text,
    quantity: posInt,
    price_each: posInt,
    bucket: text.optional(),
    private: bool.optional(),
  }).strict()).max(50).optional(),
}).strict().refine(
  (value) => Boolean((value.item_id && value.quantity && value.price_each) || (value.orders && value.orders.length > 0)),
  "item_id, quantity and price_each or orders are required",
);

const acceptMissionArg = z.object({ id: text.optional(), template_id: text.optional() }).strict()
  .refine((value) => Boolean(value.id || value.template_id), "id or template_id is required");
const declineMissionArg = z.object({ id: text.optional(), mission_id: text.optional() }).strict()
  .refine((value) => Boolean(value.id || value.mission_id), "id or mission_id is required");
const distressArg = z.object({ distress_type: z.enum(["fuel", "repair", "combat", "tow"]) }).strict();

const passengerListArg = z.object({ id: text.optional() }).strict();
const passengerUnloadArg = z.object({ id: text, target: text.optional() }).strict();

const storageTransferArg = z.object({
  target: text.optional(),
  source: z.enum(["cargo", "storage", "faction"]).optional(),
  item_id: text.optional(),
  quantity: posInt.optional(),
  items: itemQuantities.optional(),
  bucket: text.optional(),
  dest_bucket: text.optional(),
}).strict();
const storageDepositArg = storageTransferArg.extend({
  credits: posInt.optional(),
  message: text.optional(),
});
const storageWithdrawArg = storageTransferArg;
const storageViewArg = z.object({ target: text.optional(), station_id: text.optional() }).strict();
const storageLootArg = z.object({
  wreck_id: text.optional(),
  item_id: text.optional(),
  module_id: text.optional(),
  quantity: posInt.optional(),
}).strict();
const storageJettisonArg = z.object({
  item_id: text.optional(),
  quantity: posInt.optional(),
  items: itemQuantities.optional(),
}).strict().refine(
  (value) => Boolean((value.item_id && value.quantity) || (value.items && value.items.length > 0)),
  "item_id and quantity or items are required",
);
const tradeIdArg = z.object({ trade_id: text }).strict();
const tradeOfferArg = z.object({
  target: text,
  offer_items: itemQuantities.optional(),
  offer_credits: nonNegInt.optional(),
  request_items: itemQuantities.optional(),
  request_credits: nonNegInt.optional(),
  note: z.string().max(500).optional(),
  offer_safe_passage: bool.optional(),
  hold: bool.optional(),
  station_id: text.optional(),
}).strict();

const craftJobArg = z.object({
  recipe_id: text,
  quantity: posInt.optional(),
  source: text.optional(),
  deliver_to: text.optional(),
  target: text.optional(),
  preset: text.optional(),
  facility_id: text.optional(),
  items: itemQuantities.optional(),
  package_id: text.optional(),
  package_ids: z.array(text).max(50).optional(),
  label: z.string().max(255).optional(),
  output_package_label: z.string().max(255).optional(),
}).strict();
const recycleJobArg = z.object({
  recipe_id: text,
  quantity: posInt.optional(),
  source: text.optional(),
  deliver_to: text.optional(),
  preset: text.optional(),
  facility_id: text.optional(),
}).strict();
const craftArg = z.object({
  id: text.optional(),
  quantity: posInt.optional(),
  count: posInt.optional(),
  source: text.optional(),
  deliver_to: text.optional(),
  target: text.optional(),
  preset: z.enum(["fast", "cheap", "prefer_own", "workshop"]).optional(),
  facility_id: text.optional(),
  dry_run: bool.optional(),
  job_id: text.optional(),
  job_ids: z.array(text).max(50).optional(),
  package_id: text.optional(),
  package_ids: z.array(text).max(50).optional(),
  items: itemQuantities.optional(),
  label: z.string().max(255).optional(),
  output_package_label: z.string().max(255).optional(),
  jobs: z.array(craftJobArg).max(50).optional(),
}).strict();
const recycleArg = z.object({
  id: text.optional(),
  quantity: posInt.optional(),
  source: text.optional(),
  deliver_to: text.optional(),
  preset: z.enum(["fast", "cheap", "prefer_own"]).optional(),
  facility_id: text.optional(),
  dry_run: bool.optional(),
  job_id: text.optional(),
  job_ids: z.array(text).max(50).optional(),
  jobs: z.array(recycleJobArg).max(50).optional(),
}).strict();

const shippingServiceArg = z.object({
  package_id: text,
  destination_base_id: text,
  base_reward: posInt.optional(),
  speed_bonus: nonNegInt.optional(),
  insured: bool.optional(),
  service_level: z.enum(["standard", "priority"]).optional(),
  shipper: z.enum(["player", "faction"]).optional(),
  visibility: z.enum(["public", "faction", "allies", "invited"]).optional(),
  recipient_type: z.enum(["player", "faction", "station"]).optional(),
  recipient_id: text.optional(),
  invited_carrier_type: z.enum(["player", "faction"]).optional(),
  invited_carrier_id: text.optional(),
  source: z.enum(["cargo", "storage", "faction"]).optional(),
  source_bucket_id: text.optional(),
}).strict();
const shippingPostArg = shippingServiceArg.extend({
  base_reward: posInt,
  max_total_cost: posInt.optional(),
});
const shippingListArg = z.object({
  eligible_as: z.enum(["player", "faction"]).optional(),
  filter_destination: text.optional(),
  filter_service_level: z.enum(["standard", "priority"]).optional(),
  filter_shipper: text.optional(),
  include_ineligible: bool.optional(),
  sort: z.enum(["reward", "distance", "age"]).optional(),
  page: posInt.optional(),
  per_page: posInt.max(50).optional(),
}).strict();
const shippingListAllArg = shippingListArg.extend({ filter_origin: text.optional() });
const shippingAcceptArg = z.object({ shipment_id: text, carrier: z.enum(["player", "faction"]).optional() }).strict();
const shippingTrackArg = z.object({
  shipment_id: text.optional(),
  package_id: text.optional(),
  limit: posInt.max(200).optional(),
}).strict().refine((value) => Boolean(value.shipment_id || value.package_id), "shipment_id or package_id is required");
const shippingPayDebtArg = z.object({ amount: posInt.optional(), carrier: z.enum(["player", "faction"]).optional() }).strict();
const shippingProfileArg = z.object({ carrier: z.enum(["player", "faction"]).optional() }).strict();
const shippingCancelArg = z.object({ shipment_id: text }).strict();

const socialChatArg = z.object({
  target: z.enum(["system", "local", "faction", "private"]),
  content: text,
  target_id: text.optional(),
}).strict();
const chatHistoryArg = z.object({
  target: z.enum(["system", "local", "faction", "private", "emergency"]),
  target_id: text.optional(),
  after: text.optional(),
  before: text.optional(),
  limit: posInt.max(100).optional(),
}).strict();
const petitionArg = z.object({
  target: z.enum(["solarian", "voidborn", "crimson", "nebula", "outerrim"]),
  content: z.string().min(1).max(1000),
}).strict();
const forumCategory = z.enum(["general", "strategies", "bugs", "features", "trading", "factions", "help-wanted", "custom-tools", "lore", "creative"]);
const forumCreateArg = z.object({ title: text, content: text, category: forumCategory.optional() }).strict();
const forumTargetContentArg = z.object({ target: text, content: text }).strict();
const forumEditThreadArg = z.object({ target: text, title: text.optional(), content: text.optional() }).strict()
  .refine((value) => Boolean(value.title || value.content), "title or content is required");
const forumGetArg = z.object({ target: text, page: posInt.optional(), limit: posInt.max(100).optional() }).strict();
const forumListArg = z.object({
  search: text.optional(),
  category: forumCategory.optional(),
  author: text.optional(),
  faction_tag: text.optional(),
  date_from: text.optional(),
  date_to: text.optional(),
  dev_only: bool.optional(),
  sort_by: z.enum(["newest", "hot", "most_replies", "most_upvotes"]).optional(),
  page: posInt.optional(),
  limit: posInt.max(100).optional(),
}).strict();
const forumUpvoteArg = z.object({ target: text, reply_id: text.optional() }).strict();
const createNoteArg = z.object({ title: z.string().min(1).max(100), content: z.string().min(1).max(100000) }).strict();
const writeNoteArg = z.object({ target: text, content: text }).strict();
const captainsLogEntryArg = z.object({ content: z.string().min(1).max(30000) }).strict();
const captainsLogIndexArg = z.object({ index: nonNegInt }).strict();
const actionLogArg = z.object({
  category: z.enum(["combat", "trading", "ship", "crafting", "faction", "mission", "skill", "salvage", "storage", "achievement", "mining", "navigation", "exploration", "reputation", "drone", "session", "other"]).optional(),
  event_type: z.union([text, z.array(text)]).optional(),
  faction_id: text.optional(),
  since_id: nonNegInt.optional(),
  page: posInt.optional(),
  page_size: posInt.max(100).optional(),
}).strict();
const setStatusArg = z.object({ content: z.string().max(64).optional(), clan_tag: z.string().max(4).optional() }).strict();
const setColorsArg = z.object({
  content: text.optional(),
  primary_color: text.optional(),
  secondary_color: text.optional(),
}).strict();
const channelsArg = z.object({ channels: z.array(text).min(1).max(50) }).strict();
const unmuteArg = z.object({ channels: z.array(text).min(1).max(50).optional(), all: bool.optional() }).strict();

export const ACTION_SPECS: Record<string, ActionSpec> = {
  "spacemolt/get_status": spec(none, "none", "full player, ship, cargo, credits, location and missions"),
  "spacemolt/get_location": spec(none, "none", "current system, POI and docked state"),
  "spacemolt/get_system": spec(none, "none", "charted POIs, connections and police level"),
  "spacemolt/get_poi": spec(none, "none", "resources, station services and fuel price at current POI"),
  "spacemolt/get_nearby": spec(none, "none", "players and objects here"),
  "spacemolt/get_cargo": spec(none, "none", "cargo contents"),
  "spacemolt/get_ship": spec(shipArg, "id?", "hull, modules, fuel and credits"),
  "spacemolt/get_skills": spec(none, "none", "skill levels and XP"),
  "spacemolt/get_notifications": spec(notificationsArg, "clear?, limit?, types?", "pending notifications"),
  "spacemolt/get_queue": spec(none, "none", "pending action"),
  "spacemolt/get_map": spec(mapArg, "system_id?", "galaxy map, optionally for one system"),
  "spacemolt/search_systems": spec(searchSystemsArg, "text", "find systems by name"),
  "spacemolt/get_missions": spec(none, "none", "missions offered at current base"),
  "spacemolt/get_active_missions": spec(none, "none", "active mission progress"),
  "spacemolt/completed_missions": spec(none, "none", "all completed missions"),
  "spacemolt/view_completed_mission": spec(idArg, "id", "completed mission details"),
  "spacemolt/get_achievements": spec(none, "none", "achievement progress"),
  "spacemolt/get_tax_estimate": spec(none, "none", "pending taxes and bounties"),
  "spacemolt/get_commands": spec(none, "none", "machine-readable command list"),
  "spacemolt/get_guide": spec(guideArg, "id?", "playstyle guide; omit id to list guides"),
  "spacemolt/get_version": spec(versionArg, "id?, text?, page?, count?", "release notes; count max 20"),
  "spacemolt/help": spec(helpArg, "topic?", "detailed docs for an action or keyword"),
  "spacemolt/find_route": spec(idArg, "id", "shortest path to a system, POI or base"),
  "spacemolt/travel": spec(idArg, "id", "move to a POI or station in the current system"),
  "spacemolt/jump": spec(idArg, "id", "jump to an adjacent system or charted wormhole; id is always a string"),
  "spacemolt/dock": spec(none, "none", "dock at the current station; takes no target"),
  "spacemolt/undock": spec(none, "none", "leave the station"),
  "spacemolt/mine": spec(none, "none", "extract resources at current POI"),
  "spacemolt/survey_system": spec(none, "none", "read ore at charted POIs and scan for hidden POIs"),
  "spacemolt/refuel": spec(refuelArg, "id?, quantity?, target?", "refuel yourself: empty args while docked, id/quantity for cargo fuel cells in space; target=fleet for status, target=player ID/username to transfer"),
  "spacemolt/repair": spec(repairArg, "quantity?, id?, target?", "repair yourself: empty args at station, id/quantity for kits in space; target=fleet for status, target=player ID/username to repair"),
  "spacemolt/scan": spec(scanArg, "id, mode?", "scan a target; mode cargo scans a player's cargo"),
  "spacemolt/buy": spec(buyArg, "id, quantity, auto_list?, deliver_to?", "buy from station exchange"),
  "spacemolt/sell": spec(sellArg, "id, quantity, auto_list?", "sell to station exchange"),
  "spacemolt/jettison": spec(jettisonArg, "id?, quantity?, items?", "dump cargo using one item or bulk items"),
  "spacemolt/accept_mission": spec(acceptMissionArg, "id?, template_id?", "accept a mission"),
  "spacemolt/complete_mission": spec(idArg, "id", "turn in a completed mission"),
  "spacemolt/decline_mission": spec(declineMissionArg, "id?, mission_id?", "decline an offered mission"),
  "spacemolt/abandon_mission": spec(idArg, "id", "drop an active mission"),
  "spacemolt/interact_poi": spec(none, "none", "copy an archive or complete its accepted mission"),
  "spacemolt/distress_signal": spec(distressArg, "distress_type", "broadcast a distress call"),
  "spacemolt/list_station_passengers": spec(passengerListArg, "id?", "list waiting passengers and fare demand"),
  "spacemolt/load_passenger": spec(idArg, "id", "load all passengers bound for a destination"),
  "spacemolt/unload_passenger": spec(passengerUnloadArg, "id, target?", "put a passenger off here, at a lounge, or onto another ship"),
  "spacemolt/list_passengers": spec(none, "none", "list passengers aboard and berths"),
  "spacemolt/craft": spec(craftArg, "id?, quantity?, count?, source?, deliver_to?, target?, preset?, facility_id?, dry_run?, job_id?, job_ids?, jobs?, package_id?, package_ids?, items?, label?, output_package_label?", "queue a crafting job or manage queued jobs"),
  "spacemolt/recycle": spec(recycleArg, "id?, quantity?, source?, deliver_to?, preset?, facility_id?, dry_run?, job_id?, job_ids?, jobs?", "queue a recycling job or manage queued jobs"),
  "spacemolt/attack": spec(idArg, "id", "attack a visible target; starts combat"),
  "spacemolt/hunt": spec(idArg, "id", "hunt a wildlife creature at your POI"),
  "spacemolt/cloak": spec(cloakArg, "enable?, quantity?", "toggle cloaking device"),
  "spacemolt/self_destruct": spec(none, "none", "destroy your own ship outside battle"),
  "spacemolt_battle/stance": spec(stanceArg, "id, target?, marines?, intent?", "change battle posture"),
  "spacemolt_battle/target": spec(idArg, "id", "focus fire on a combatant"),
  "spacemolt_battle/engage": spec(z.object({ side_id: int.optional() }).strict(), "side_id?", "join a battle in your system"),
  "spacemolt_battle/advance": spec(none, "none", "move one combat zone closer"),
  "spacemolt_battle/retreat": spec(none, "none", "move one combat zone back"),
  "spacemolt_battle/default_stance": spec(defaultStanceArg, "id", "set the default combat stance"),
  "spacemolt_battle/status": spec(none, "none", "full battle state"),
  "spacemolt_battle/summary": spec(idArg, "id", "aggregate battle result"),
  "spacemolt_battle/log": spec(battleLogArg, "id, tick_start?, tick_end?, limit?", "tick-by-tick combat replay"),
  "spacemolt_battle/reload": spec(reloadArg, "id?, target?, weapons?", "load ammo from cargo into weapons"),
  "spacemolt_battle/self_destruct": spec(none, "none", "start the in-battle self-destruct countdown"),
  "spacemolt_arena/challenge": spec(arenaChallengeArg, "id, max_side_size?", "challenge another pilot at an arena"),
  "spacemolt_arena/accept": spec(none, "none", "accept a pending arena challenge"),
  "spacemolt_arena/decline": spec(none, "none", "decline a pending arena challenge"),
  "spacemolt_arena/cancel": spec(none, "none", "withdraw an issued arena challenge"),
  "spacemolt_arena/status": spec(none, "none", "arena challenges, stats and current match"),
  "spacemolt_arena/challenges": spec(none, "none", "list NPC arena challenges"),
  "spacemolt_arena/fight": spec(idArg, "id", "start an NPC arena challenge"),
  "spacemolt_faction/create": spec(factionCreateArg, "id, text", "create a faction with a four-character tag and name"),
  "spacemolt_faction/join": spec(idArg, "id", "accept a faction invitation"),
  "spacemolt_faction/leave": spec(none, "none", "leave your faction"),
  "spacemolt_faction/invite": spec(idArg, "id", "invite a player"),
  "spacemolt_faction/kick": spec(idArg, "id", "remove a member"),
  "spacemolt_faction/info": spec(infoArg, "id?, limit?, offset?", "faction details"),
  "spacemolt_faction/list": spec(factionListArg, "limit?, offset?", "list all factions"),
  "spacemolt_faction/garages": spec(none, "none", "faction ship-garage roster"),
  "spacemolt_faction/get_invites": spec(none, "none", "pending faction invitations"),
  "spacemolt_faction/accept_invite": spec(idArg, "id", "accept an invitation"),
  "spacemolt_faction/decline_invite": spec(idArg, "id", "decline an invitation"),
  "spacemolt_faction/propose_ally": spec(idArg, "id", "propose an alliance"),
  "spacemolt_faction/accept_ally": spec(idArg, "id", "ratify an alliance"),
  "spacemolt_faction/remove_ally": spec(idArg, "id", "dissolve an alliance"),
  "spacemolt_faction/set_enemy": spec(idArg, "id", "set a faction as enemy"),
  "spacemolt_faction/remove_enemy": spec(idArg, "id", "return an enemy faction to neutral"),
  "spacemolt_faction/declare_war": spec(factionTextArg, "id, text?", "declare war with an optional reason"),
  "spacemolt_faction/propose_peace": spec(factionTextArg, "id, text?", "propose peace with optional terms"),
  "spacemolt_faction/accept_peace": spec(idArg, "id", "accept a peace proposal"),
  "spacemolt_faction/rooms": spec(none, "none", "list faction rooms at this station"),
  "spacemolt_faction/visit_room": spec(idArg, "id", "visit a faction room"),
  "spacemolt_faction/delete_room": spec(idArg, "id", "delete a faction room"),
  "spacemolt_faction/delete_role": spec(idArg, "id", "delete a custom role"),
  "spacemolt_faction/list_missions": spec(none, "none", "list faction-posted missions"),
  "spacemolt_faction/cancel_mission": spec(idArg, "id", "cancel a faction mission"),
  "spacemolt_faction/tax_estimate": spec(none, "none", "preview faction income tax"),
  "spacemolt_faction/prepay_tax": spec(factionPrepayArg, "amount", "prepay faction tax"),
  "spacemolt_faction/get_mobile_base": spec(none, "none", "inspect the faction mobile base"),
  "spacemolt_faction/move_mobile_base": spec(factionMoveArg, "x, y", "move the mobile base within 10 AU"),
  "spacemolt_faction/jump_mobile_base": spec(idArg, "id", "prepare a mobile-base jump"),
  "spacemolt_faction/cancel_mobile_base_jump": spec(none, "none", "cancel a prepared mobile-base jump"),
  "spacemolt_faction/decommission_mobile_base": spec(none, "none", "permanently retire an empty mobile base"),
  "spacemolt_faction_admin/create_role": spec(createRoleArg, "name, priority, permissions?", "create a custom faction role"),
  "spacemolt_faction_admin/edit_role": spec(editRoleArg, "role_id, name?, permissions?", "edit a custom faction role"),
  "spacemolt_faction_admin/promote": spec(promoteArg, "player_id, role_id", "change a member's role"),
  "spacemolt_faction_admin/edit": spec(factionEditArg, "charter?, description?, colors?, ally toggles?", "edit faction settings"),
  "spacemolt_faction_admin/write_room": spec(writeRoomArg, "room_id?, name?, description?, access?", "write a faction room description"),
  "spacemolt_faction_admin/post_mission": spec(postMissionArg, "title, description, type, objectives, rewards?, giver_name?, giver_title?, expiration_hours?, dialog?, triggers?", "post a faction mission"),
  "spacemolt_faction_commerce/create_buy_order": spec(factionOrderArg, "item_id?, quantity?, price_each?, bucket?, private?, orders?", "create a faction buy order"),
  "spacemolt_faction_commerce/create_sell_order": spec(factionOrderArg, "item_id?, quantity?, price_each?, bucket?, private?, orders?", "create a faction sell order"),
  "spacemolt_storage/view": spec(storageViewArg, "target?, station_id?", "view personal or faction storage"),
  "spacemolt_storage/deposit": spec(storageDepositArg, "target?, source?, item_id?, quantity?, credits?, items?, bucket?, dest_bucket?, message?", "deposit items from cargo into station storage, or gift resources"),
  "spacemolt_storage/withdraw": spec(storageWithdrawArg, "target?, source?, item_id?, quantity?, items?, bucket?, dest_bucket?", "withdraw items from station storage into cargo"),
  "spacemolt_storage/loot": spec(storageLootArg, "wreck_id?, item_id?, module_id?, quantity?", "loot a wreck"),
  "spacemolt_storage/jettison": spec(storageJettisonArg, "item_id?, quantity?, items?", "dump cargo using single-item or bulk form"),
  "spacemolt_transfer/trade_offer": spec(tradeOfferArg, "target, offer_items?, offer_credits?, request_items?, request_credits?, note?, offer_safe_passage?, hold?, station_id?", "propose a player trade or toll"),
  "spacemolt_transfer/trade_accept": spec(tradeIdArg, "trade_id", "accept an incoming trade offer"),
  "spacemolt_transfer/trade_decline": spec(tradeIdArg, "trade_id", "decline an incoming trade offer"),
  "spacemolt_transfer/trade_cancel": spec(tradeIdArg, "trade_id", "cancel an outgoing trade offer"),
  "spacemolt_transfer/get_trades": spec(none, "none", "list pending trade offers"),
  "spacemolt_shipping/quote": spec(shippingServiceArg, "package_id, destination_base_id, base_reward?, speed_bonus?, insured?, service_level?, shipper?, visibility?, recipient_type?, recipient_id?, invited_carrier_type?, invited_carrier_id?, source?, source_bucket_id?", "price a freight route without posting"),
  "spacemolt_shipping/post": spec(shippingPostArg, "package_id, destination_base_id, base_reward, speed_bonus?, insured?, service_level?, shipper?, visibility?, recipient_type?, recipient_id?, invited_carrier_type?, invited_carrier_id?, source?, source_bucket_id?, max_total_cost?", "post a sealed freight contract"),
  "spacemolt_shipping/list": spec(shippingListArg, "eligible_as?, filter_destination?, filter_service_level?, filter_shipper?, include_ineligible?, sort?, page?, per_page?", "browse eligible freight at this station"),
  "spacemolt_shipping/list_all": spec(shippingListAllArg, "eligible_as?, filter_origin?, filter_destination?, filter_service_level?, filter_shipper?, include_ineligible?, sort?, page?, per_page?", "browse eligible freight across charted stations"),
  "spacemolt_shipping/active": spec(none, "none", "list your active freight contracts"),
  "spacemolt_shipping/get": spec(shipmentArg, "shipment_id? or package_id", "inspect a freight contract"),
  "spacemolt_shipping/track": spec(shippingTrackArg, "shipment_id? or package_id, limit?", "inspect seal-beacon history"),
  "spacemolt_shipping/profile": spec(shippingProfileArg, "carrier?", "view a carrier record"),
  "spacemolt_shipping/pay_debt": spec(shippingPayDebtArg, "amount?, carrier?", "repay freight debt"),
  "spacemolt_shipping/accept": spec(shippingAcceptArg, "shipment_id, carrier?", "bind a carrier to a freight contract"),
  "spacemolt_shipping/deliver": spec(shipmentArg, "shipment_id? or package_id", "deliver a sealed package"),
  "spacemolt_shipping/return": spec(shipmentArg, "shipment_id? or package_id", "return freight to origin"),
  "spacemolt_shipping/reclaim": spec(shipmentArg, "shipment_id? or package_id", "reclaim a package after default"),
  "spacemolt_shipping/cancel": spec(shippingCancelArg, "shipment_id", "cancel a posted contract"),
  "spacemolt_social/chat": spec(socialChatArg, "target, content, target_id?", "send a public, faction or private chat message"),
  "spacemolt_social/get_chat_history": spec(chatHistoryArg, "target, target_id?, after?, before?, limit?", "read chat history"),
  "spacemolt_social/petition": spec(petitionArg, "target, content", "petition an empire government"),
  "spacemolt_social/forum_create_thread": spec(forumCreateArg, "title, content, category?", "create a forum thread"),
  "spacemolt_social/forum_reply": spec(forumTargetContentArg, "target, content", "reply to a forum thread"),
  "spacemolt_social/forum_edit_thread": spec(forumEditThreadArg, "target, title?, content?", "edit your forum thread"),
  "spacemolt_social/forum_edit_reply": spec(forumTargetContentArg, "target, content", "edit your forum reply"),
  "spacemolt_social/forum_get_thread": spec(forumGetArg, "target, page?, limit?", "read a forum thread"),
  "spacemolt_social/forum_list": spec(forumListArg, "search?, category?, author?, faction_tag?, date_from?, date_to?, dev_only?, sort_by?, page?, limit?", "list forum threads"),
  "spacemolt_social/forum_upvote": spec(forumUpvoteArg, "target, reply_id?", "upvote a thread or reply"),
  "spacemolt_social/forum_delete_thread": spec(targetArg, "target", "delete your forum thread"),
  "spacemolt_social/forum_delete_reply": spec(targetArg, "target", "delete your forum reply"),
  "spacemolt_social/create_note": spec(createNoteArg, "title, content", "create a persistent note"),
  "spacemolt_social/write_note": spec(writeNoteArg, "target, content", "replace a note's full body"),
  "spacemolt_social/read_note": spec(targetArg, "target", "read a note"),
  "spacemolt_social/get_notes": spec(notesArg, "page?, page_size?", "list persistent notes"),
  "spacemolt_social/delete_note": spec(targetArg, "target", "delete a note"),
  "spacemolt_social/captains_log_add": spec(captainsLogEntryArg, "content", "add a captain's log entry"),
  "spacemolt_social/captains_log_list": spec(z.object({ index: nonNegInt.optional() }).strict(), "index?", "list captain's log entries"),
  "spacemolt_social/captains_log_get": spec(captainsLogIndexArg, "index", "read one captain's log entry"),
  "spacemolt_social/captains_log_delete": spec(captainsLogIndexArg, "index", "delete one captain's log entry"),
  "spacemolt_social/get_action_log": spec(actionLogArg, "category?, event_type?, faction_id?, since_id?, page?, page_size?", "read action history"),
  "spacemolt_social/set_status": spec(setStatusArg, "content?, clan_tag?", "set status message and clan tag"),
  "spacemolt_social/set_colors": spec(setColorsArg, "content?, primary_color?, secondary_color?", "set display colors"),
  "spacemolt_social/mute_notifications": spec(channelsArg, "channels", "mute notification channels"),
  "spacemolt_social/unmute_notifications": spec(unmuteArg, "channels? or all", "resume notification channels"),
  "spacemolt_social/get_notification_settings": spec(none, "none", "list notification channels and mute state"),
};

const ACTION_ALIASES: Record<string, { tool: string; action: string }> = {
  "spacemolt/chat": { tool: "spacemolt_social", action: "chat" },
};

export const pendingActionInputSchema = z.object({
  id: text.optional(),
  tool: text.default("spacemolt"),
  action: text,
  args: z.record(z.unknown()).default({}),
  reason: z.string().max(500).optional(),
  approval: z.boolean().optional(),
}).strict();

export type PendingAction = z.infer<typeof pendingActionInputSchema>;

export type ParsedGameAction =
  | { ok: true; action: PendingAction }
  | { ok: false; error: string };

export function parseGameAction(raw: unknown): ParsedGameAction {
  const base = pendingActionInputSchema.safeParse(raw);
  if (!base.success) {
    return { ok: false, error: base.error.issues[0]?.message ?? "Invalid action" };
  }
  const requestedKey = `${base.data.tool}/${base.data.action}`;
  const alias = ACTION_ALIASES[requestedKey];
  const tool = alias?.tool ?? base.data.tool;
  const action = alias?.action ?? base.data.action;
  const actionSpec = ACTION_SPECS[`${tool}/${action}`];
  if (!actionSpec) {
    return { ok: false, error: `Unknown action: ${requestedKey}` };
  }
  if (actionSpec.argsText === "none") {
    return { ok: true, action: { ...base.data, tool, action, args: {} } };
  }
  const parsedArgs = actionSpec.schema.safeParse(base.data.args);
  if (!parsedArgs.success) {
    return { ok: false, error: parsedArgs.error.issues[0]?.message ?? "Invalid action args" };
  }
  return {
    ok: true,
    action: { ...base.data, tool, action, args: parsedArgs.data as Record<string, unknown> },
  };
}

const SAFE_KEYS = new Set([
  "spacemolt/get_status",
  "spacemolt/get_location",
  "spacemolt/get_system",
  "spacemolt/get_poi",
  "spacemolt/get_nearby",
  "spacemolt/get_cargo",
  "spacemolt/get_ship",
  "spacemolt/get_skills",
  "spacemolt/get_notifications",
  "spacemolt/get_queue",
  "spacemolt/get_map",
  "spacemolt/search_systems",
  "spacemolt/get_missions",
  "spacemolt/get_active_missions",
  "spacemolt/completed_missions",
  "spacemolt/view_completed_mission",
  "spacemolt/get_achievements",
  "spacemolt/get_tax_estimate",
  "spacemolt/get_commands",
  "spacemolt/get_guide",
  "spacemolt/get_version",
  "spacemolt/help",
  "spacemolt/find_route",
  "spacemolt/travel",
  "spacemolt/jump",
  "spacemolt/dock",
  "spacemolt/undock",
  "spacemolt/mine",
  "spacemolt/survey_system",
  "spacemolt/refuel",
  "spacemolt/repair",
  "spacemolt/scan",
  "spacemolt/buy",
  "spacemolt/sell",
  "spacemolt/jettison",
  "spacemolt_faction/info",
  "spacemolt_faction/list",
  "spacemolt_faction/garages",
  "spacemolt_faction/get_invites",
  "spacemolt_faction/rooms",
  "spacemolt_faction/tax_estimate",
  "spacemolt_faction/list_missions",
  "spacemolt_faction/get_mobile_base",
  "spacemolt_battle/status",
  "spacemolt_battle/summary",
  "spacemolt_battle/log",
  "spacemolt_arena/status",
  "spacemolt_arena/challenges",
  "spacemolt_storage/view",
  "spacemolt_shipping/quote",
  "spacemolt_shipping/list",
  "spacemolt_shipping/list_all",
  "spacemolt_shipping/active",
  "spacemolt_shipping/get",
  "spacemolt_shipping/track",
  "spacemolt_shipping/profile",
  "spacemolt_social/get_chat_history",
  "spacemolt_social/forum_get_thread",
  "spacemolt_social/forum_list",
  "spacemolt_social/read_note",
  "spacemolt_social/get_notes",
  "spacemolt_social/captains_log_list",
  "spacemolt_social/captains_log_get",
  "spacemolt_social/get_action_log",
  "spacemolt_social/get_notification_settings",
  "spacemolt_transfer/get_trades",
]);

export function requiresApproval(action: PendingAction): boolean {
  const key = `${action.tool}/${action.action}`;
  if ((key === "spacemolt/craft" || key === "spacemolt/recycle") && action.args.dry_run === true) return false;
  if (!SAFE_KEYS.has(key)) return true;
  if ((key === "spacemolt/refuel" || key === "spacemolt/repair") && typeof action.args.target === "string" && action.args.target !== "fleet") return true;
  if (key === "spacemolt/scan" && action.args.mode === "cargo") return true;
  return false;
}

const TOOL_LIST = Object.entries(ACTION_SPECS).map(([key, actionSpec]) => {
  const [tool, ...rest] = key.split("/");
  const action = rest.join("/");
  return {
    tool,
    action,
    args: actionSpec.argsText,
    use: actionSpec.use,
  };
});

export type GameActionRecord = {
  tool?: string;
  action: string;
  args: Record<string, unknown>;
  ok: boolean;
  pending?: boolean;
  result?: string;
  structured?: unknown;
  error?: string;
};

export type RouteStep = { systemId: string; name?: string; jumps: number; kind?: "jump" | "travel" };

export type RoutePlan = {
  destination: string;
  steps: RouteStep[];
  totalJumps: number;
  targetSystem?: string;
  targetPoi?: string;
  targetPoiName?: string;
  message?: string;
  estimatedFuel?: number;
  fuelAvailable?: number;
};

export function compact(value: unknown, max = 12000): string {
  const text = typeof value === "string" ? value : JSON.stringify(value) ?? "";
  return text.length > max ? `${text.slice(0, max)}… [truncated]` : text;
}

function hasMissionContent(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  return false;
}

export function activeMissionsText(statusContent: unknown): string | undefined {
  if (!statusContent || typeof statusContent !== "object" || Array.isArray(statusContent)) return undefined;
  const content = statusContent as Record<string, unknown>;
  const candidates = [content.active_missions, content.activeMissions];
  const found = candidates.find(hasMissionContent);
  if (found !== undefined) return `Server-provided active missions (work these first unless the pilot asks otherwise):\n${compact(found, 6000)}`;

  const missions = content.missions;
  if (missions && typeof missions === "object" && !Array.isArray(missions)) {
    const record = missions as Record<string, unknown>;
    const nested = ["active", "active_missions", "activeMissions"].map((key) => record[key]).find(hasMissionContent);
    return nested === undefined
      ? undefined
      : `Server-provided active missions (work these first unless the pilot asks otherwise):\n${compact(nested, 6000)}`;
  }

  return hasMissionContent(missions)
    ? `Server-provided active missions (work these first unless the pilot asks otherwise):\n${compact(missions, 6000)}`
    : undefined;
}

function jsonSafe(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value ?? null)) as unknown;
  } catch {
    return null;
  }
}

function textOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function parseRoutePlan(value: unknown, destination: string): RoutePlan | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  if (payload.found === false) return null;
  if (!Array.isArray(payload.route)) return null;

  const steps: RouteStep[] = [];
  for (const raw of payload.route) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const step = raw as Record<string, unknown>;
    const systemId = textOrUndefined(step.system_id);
    const jumps = numberOrUndefined(step.jumps);
    if (!systemId || jumps === undefined || jumps <= 0) continue;
    steps.push({
      systemId,
      name: textOrUndefined(step.name),
      jumps,
    });
  }
  if (steps.length === 0) return null;
  steps.sort((left, right) => left.jumps - right.jumps);

  const totalJumps = numberOrUndefined(payload.total_jumps) ?? steps.length;
  const targetPoi = textOrUndefined(payload.target_poi);
  if (targetPoi) {
    steps.push({
      systemId: targetPoi,
      name: textOrUndefined(payload.target_poi_name) ?? targetPoi,
      jumps: totalJumps,
      kind: "travel",
    });
  }

  return {
    destination,
    steps,
    totalJumps,
    targetSystem: textOrUndefined(payload.target_system),
    targetPoi,
    targetPoiName: textOrUndefined(payload.target_poi_name),
    message: textOrUndefined(payload.message),
    estimatedFuel: numberOrUndefined(payload.estimated_fuel),
    fuelAvailable: numberOrUndefined(payload.fuel_available),
  };
}

export function invalidGameActionRecord(raw: unknown, error: string): GameActionRecord {
  const rawObject = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return {
    tool: typeof rawObject.tool === "string" ? rawObject.tool : "spacemolt",
    action: typeof rawObject.action === "string" ? rawObject.action : "unknown",
    args: rawObject.args && typeof rawObject.args === "object" ? rawObject.args as Record<string, unknown> : {},
    ok: false,
    error,
  };
}

export async function executeGameAction(
  client: SpaceMoltClient,
  sessionId: string,
  raw: unknown,
): Promise<GameActionRecord> {
  const parsed = parseGameAction(raw);
  if (!parsed.ok) {
    return invalidGameActionRecord(raw, parsed.error);
  }

  try {
    const response = await client.post(
      parsed.action.tool,
      parsed.action.action,
      parsed.action.args,
      sessionId,
    );
    const payload = response.structuredContent ?? response.result ?? response;
    return {
      tool: parsed.action.tool,
      action: parsed.action.action,
      args: parsed.action.args,
      ok: true,
      result: compact(payload),
      structured: jsonSafe(payload),
    };
  } catch (err) {
    return {
      tool: parsed.action.tool,
      action: parsed.action.action,
      args: parsed.action.args,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function executeApprovedActions(
  client: SpaceMoltClient,
  sessionId: string,
  rawActions: unknown[],
): Promise<GameActionRecord[]> {
  const results: GameActionRecord[] = [];
  for (const raw of rawActions.slice(0, 10)) {
    const parsed = parseGameAction(raw);
    if (!parsed.ok) {
      results.push(invalidGameActionRecord(raw, parsed.error));
      continue;
    }
    if (!requiresApproval(parsed.action)) {
      results.push({
        tool: parsed.action.tool,
        action: parsed.action.action,
        args: parsed.action.args,
        ok: false,
        error: "Action does not require approval",
      });
      continue;
    }
    results.push(await executeGameAction(client, sessionId, parsed.action));
  }
  return results;
}

export const GAMEPLAY_SYSTEM_PROMPT = [
  "You are the pilot's SpaceMolt copilot, connected to a live pilot session.",
  "You can read game state and propose actions. The backend executes only the listed tools.",
  "Active missions from server state outrank the optional personal objective set in the UI. Work on them first; use mining/trade loops only when they serve that active work. If the pilot's latest request explicitly asks for something else, follow that request. After each meaningful batch, tell the pilot what changed and stop; do not loop on checks that return nothing new.",
  "Use only the exact tool, action and argument names shown. Extra fields are rejected before anything is sent to SpaceMolt. For actions whose args are listed as none, use an empty object.",
  "The tool field defaults to spacemolt; include it explicitly for every other tool. Chat always uses tool spacemolt_social, never spacemolt.",
  "Always ground decisions in server-provided game state and tool results. Never invent item, POI, system, player, shipment or recipe IDs.",
  "Use the server-provided in-game skills (levels and XP) to judge what the pilot can do; never invent a skill level or unlock.",
  "The backend decides which actions require approval; omit approval from your output. Write actions are returned as pending_actions for pilot approval.",
  "Chat, forum, petition, gift, trade, combat, faction, mission, passenger, crafting, shipping and refuel/repair transfers to other pilots require approval. Never claim they were executed before approval.",
  "To refuel or repair yourself, omit target: an empty object uses the docked station service; in space set id to a fuel cell or repair kit from cargo with optional quantity. target='fleet' is read-only fuel/hull status, not a fleet-wide action; a player target transfers fuel or kits.",
  "To move items from station storage into cargo, use tool spacemolt_storage, action withdraw with args.item_id and args.quantity, or args.items for bulk transfers; there is no separate transfer-to-cargo action. To move cargo into station storage, use tool spacemolt_storage, action deposit.",
  "For text actions, put the exact draft in args.content (or args.title/description where applicable). The UI shows an editable text box; after approval, send the pilot's edited text unchanged.",
  "Set done=true when no more actions are needed this turn. Safe actions execute immediately; proposals appear in pending_actions.",
  "To find a named place or system, use search_systems with args.text, then use get_map with args.system_id or find_route with args.id only on IDs the tools returned. get_map is for map context; it does not search by name.",
  "For a multi-jump trip, call find_route once. The UI can follow the returned route step by step in the background; do not spam jump calls in one turn.",
  "Return strict JSON with keys: reply(string), actions(array of at most 4 {tool?, action, args, reason?}), done(boolean). args must be a JSON object, never a JSON-encoded string; do not wrap the whole reply in a string.",
  `Available tools: ${JSON.stringify(TOOL_LIST)}`,
].join(" ");
