/** Conservative full-cube materials with ordinary block items, accepted by copycats. */
const colours = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray',
    'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'];
const woods = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'crimson', 'warped'];
export const PALETTE_COPYCAT = [
    ...colours.flatMap((colour) => [`${colour}_concrete`, `${colour}_wool`, `${colour}_terracotta`]),
    ...woods.map((wood) => `${wood}_planks`),
    'stone', 'granite', 'polished_granite', 'diorite', 'polished_diorite', 'andesite', 'polished_andesite',
    'cobblestone', 'mossy_cobblestone', 'smooth_stone', 'stone_bricks', 'mossy_stone_bricks',
    'cracked_stone_bricks', 'chiseled_stone_bricks', 'bricks', 'dirt', 'coarse_dirt',
    'sandstone', 'smooth_sandstone', 'cut_sandstone', 'chiseled_sandstone',
    'red_sandstone', 'smooth_red_sandstone', 'cut_red_sandstone', 'chiseled_red_sandstone',
    'terracotta', 'clay', 'snow_block', 'obsidian', 'crying_obsidian', 'netherrack',
    'nether_bricks', 'red_nether_bricks', 'end_stone', 'end_stone_bricks', 'purpur_block',
    'quartz_block', 'smooth_quartz', 'prismarine', 'prismarine_bricks', 'dark_prismarine',
    'gold_block', 'iron_block', 'diamond_block', 'emerald_block', 'lapis_block', 'coal_block',
    'netherite_block', 'blackstone', 'polished_blackstone', 'polished_blackstone_bricks',
].map((name) => `minecraft:${name}`);

export const COPYCAT_MATERIALS = new Set(PALETTE_COPYCAT);
