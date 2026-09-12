import { NBT, TagType } from 'prismarine-nbt';

import { saveNBT } from '../util/nbt_util';
import { FitResult, Properties } from './types';

const string = (value: string) => ({type: TagType.String as const, value});
const int = (value: number) => ({type: TagType.Int as const, value});
const compound = (value: any) => ({type: TagType.Compound as const, value});
const list = (type: TagType, value: any[]): any => ({type: TagType.List, value: {type, value}});
const enabledCT = {type: TagType.Byte, value: 1};

function state(name: string, properties: Properties = {}): any {
    const value: any = {Name: string(name)};
    if (Object.keys(properties).length) {
        value.Properties = compound(Object.fromEntries(Object.keys(properties).sort().map((key) => [key, string(properties[key])])));
    }
    return value;
}

// Minecraft 1.21 item stacks use Int `count`, not the old Byte `Count` tag.
const item = (name: string) => compound({id: string(name), count: int(1)});

export function writeCreateStructure(result: FitResult): Buffer {
    const palette: any[] = [];
    const indices = new Map<string, number>();
    const blocks = result.blocks.map((block) => {
        const shape = block.shape;
        const blockState = state(shape.name === '$material' ? block.materials.material : shape.name, shape.properties);
        const key = JSON.stringify(blockState);
        let index = indices.get(key);
        if (index === undefined) { index = palette.length; indices.set(key, index); palette.push(blockState); }
        const entry: any = {pos: list(TagType.Int, block.position), state: int(index)};
        if (shape.entityId) {
            const [x, y, z] = block.position;
            const entity: any = {id: string(shape.entityId), x: int(x), y: int(y), z: int(z)};
            if (shape.multi) {
                // Initialize every registered slot, including absent parts. Never emit legacy
                // Material on a multistate block: that would trigger Copycats+'s migration path.
                const keys = shape.name.endsWith('copycat_slab') ? ['bottom', 'top'] :
                    shape.name.endsWith('copycat_byte_panel') ? ['bottom_left', 'bottom_right', 'top_left', 'top_right'] :
                        shape.name.endsWith('copycat_byte') ? ['bottom_northeast', 'bottom_northwest', 'bottom_southeast', 'bottom_southwest', 'top_northeast', 'top_northwest', 'top_southeast', 'top_southwest'] :
                            shape.name.endsWith('copycat_board') ? ['up', 'down', 'north', 'south', 'east', 'west'] : ['negative_layers', 'positive_layers'];
                const consumed = new Set<string>();
                entity.material_data = compound(Object.fromEntries(keys.map((key) => {
                    const material = block.materials[key];
                    // The mod consumes each distinct skin item once per multistate block.
                    const stack = material && !consumed.has(material) ? item(material) : compound({});
                    if (material) consumed.add(material);
                    return [key, compound({material: compound(state(material ?? 'create:copycat_base')), consumedItem: stack, enableCT: enabledCT})];
                })));
            } else {
                entity.Material = compound(state(block.materials.material));
                entity.Item = item(block.materials.material);
                entity.EnableCT = enabledCT;
            }
            entry.nbt = compound(entity);
        }
        return entry;
    });
    const nbt: NBT = {type: TagType.Compound, name: '', value: {
        DataVersion: int(3955), // Java 1.21 / 1.21.1
        size: list(TagType.Int, result.size),
        palette: list(TagType.Compound, palette),
        blocks: list(TagType.Compound, blocks),
        entities: list(TagType.Compound, []),
    }};
    return saveNBT(nbt);
}


