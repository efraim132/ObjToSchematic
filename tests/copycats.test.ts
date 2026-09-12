import { parse, simplify } from 'prismarine-nbt';
import { gunzipSync } from 'zlib';

import { PALETTE_COPYCAT } from '../res/palettes/copycat';
import { Atlas } from '../src/atlas';
import { BlockMesh } from '../src/block_mesh';
import { RGBAColours } from '../src/colour';
import { packCopycats } from '../src/copycats/packer';
import { getCopycatShapes } from '../src/copycats/shapes';
import { writeCreateStructure } from '../src/copycats/structure';
import { FitResult, MaterialVoxel, Point } from '../src/copycats/types';
import { CreateExporter } from '../src/exporters/create_exporter';
import { ExporterFactory } from '../src/exporters/exporters';
import { ColourSpace } from '../src/util';
import { Vector3 } from '../src/vector';
import { VoxelMesh } from '../src/voxel_mesh';
import { TEST_PREAMBLE } from './preamble';

const stone = 'minecraft:stone';
const colours = ['red', 'orange', 'yellow', 'lime', 'cyan', 'blue', 'purple', 'white'].map((c) => `minecraft:${c}_concrete`);
const exact = {resolution: 2 as const, strict: true};

function rasterise(result: FitResult): Map<string, string> {
    const pixels = new Map<string, string>();
    for (const block of result.blocks) {
        for (const part of block.shape.parts) {
            for (const [x, y, z, X, Y, Z] of part.boxes) {
                for (let a = x; a < X; a++) {
                    for (let b = y; b < Y; b++) {
                        for (let c = z; c < Z; c++) {
                            const key = [a + block.position[0] * 16, b + block.position[1] * 16, c + block.position[2] * 16].join(',');
                            expect(pixels.has(key)).toBe(false);
                            pixels.set(key, block.materials[part.key]);
                        }
                    }
                }
            }
        }
    }
    return pixels;
}

test('all 255 octant masks preserve every occupied half-block and its independent colour', () => {
    // A distant anchor keeps even masks without the origin aligned to the same grid.
    for (let mask = 1; mask < 256; mask++) {
        const voxels: MaterialVoxel[] = [{position: [-2, -2, -2], material: stone}];
        const expected: MaterialVoxel[] = [];
        for (let i = 0; i < 8; i++) {
            if (mask & (1 << i)) {
                const voxel = {position: [i & 1, (i >> 2) & 1, (i >> 1) & 1] as Point, material: colours[i]};
                voxels.push(voxel); expected.push(voxel);
            }
        }
        const result = packCopycats(voxels, exact);
        expect(result.approximatedBlocks).toBe(0);
        const target = result.blocks.find((b) => b.position.join(',') === '1,1,1')!;
        expect(target).toBeDefined();
        const occupied = new Map<string, string>();
        target.shape.parts.forEach((p) => p.boxes.forEach((b) => {
            for (let x = b[0]; x < b[3]; x += 8) for (let y = b[1]; y < b[4]; y += 8) for (let z = b[2]; z < b[5]; z += 8) occupied.set([x / 8, y / 8, z / 8].join(','), target.materials[p.key]);
        }));
        expect(occupied.size).toBe(expected.length);
        expected.forEach((v) => expect(occupied.get(v.position.join(','))).toBe(v.material));
    }
});

test('1.21.1 NBT contains correct byte states, named material slots, item counts and local entity positions', async () => {
    const voxels = colours.map((material, i) => ({position: [i & 1, (i >> 2) & 1, (i >> 1) & 1] as Point, material}));
    const buffer = writeCreateStructure(packCopycats(voxels, exact));
    expect(buffer.subarray(0, 2)).toEqual(Buffer.from([0x1f, 0x8b]));
    const {parsed} = await parse(gunzipSync(buffer));
    const root: any = simplify(parsed);
    expect(root.DataVersion).toBe(3955);
    expect(root.size).toEqual([1, 1, 1]);
    expect(root.entities).toEqual([]);
    expect(root.palette).toHaveLength(1);
    expect(root.palette[0].Name).toBe('copycats:copycat_byte');
    const entity = root.blocks[0].nbt;
    expect(entity.id).toBe('copycats:multistate_copycat');
    expect([entity.x, entity.y, entity.z]).toEqual([0, 0, 0]);
    expect(entity.Material).toBeUndefined();
    expect(entity.material_data.bottom_northwest.material.Name).toBe(colours[0]);
    expect(entity.material_data.top_southeast.material.Name).toBe(colours[7]);
    expect(entity.material_data.top_southeast.consumedItem).toEqual({id: colours[7], count: 1});
    expect(entity.material_data.top_southeast.enableCT).toBe(1);
});

test('single-material panels use Create outward facing and the simple entity schema', async () => {
    const panel = getCopycatShapes().find((s) => s.name === 'create:copycat_panel' && s.properties.facing === 'up')!;
    expect(panel.parts[0].boxes).toEqual([[0, 0, 0, 16, 3, 16]]);
    const result: FitResult = {size: [1, 1, 1], blocks: [{position: [0, 0, 0], shape: panel, materials: {material: stone}}],
        inputVoxels: 768, approximatedBlocks: 0, geometryErrorPixels: 0, materialErrorPixels: 0, blockCounts: {}};
    const {parsed} = await parse(writeCreateStructure(result));
    const root: any = simplify(parsed);
    expect(root.blocks[0].nbt).toMatchObject({id: 'create:copycat', Material: {Name: stone}, Item: {id: stone, count: 1}, EnableCT: 1});
    expect(root.blocks[0].nbt.material_data).toBeUndefined();
});

test('negative coordinates, odd sizes and one-voxel-thick inputs keep their dimensions and unique positions', () => {
    const result = packCopycats([{position: [-3, -1, -5], material: stone}, {position: [1, -1, -5], material: stone}], exact);
    expect(result.size).toEqual([3, 1, 1]);
    expect(result.blocks.map((b) => b.position)).toEqual([[0, 0, 0], [2, 0, 0]]);
    expect(rasterise(result).size).toBe(1024);
});

test('strict fine fitting rejects impossible geometry; approximation preserves a nonempty cell and reports error', () => {
    // An isolated 1/16 cube at the origin has no corresponding Copycats+ block.
    const voxels: MaterialVoxel[] = [{position: [0, 0, 0], material: stone}];
    expect(() => packCopycats(voxels, {resolution: 16, strict: true})).toThrow('cannot exactly represent');
    const fitted = packCopycats(voxels, {resolution: 16, strict: false});
    expect(fitted.blocks).toHaveLength(1);
    expect(fitted.approximatedBlocks).toBe(1);
    expect(fitted.geometryErrorPixels).toBeGreaterThan(0);
});

test('pixel boards and 2-pixel layers are fitted without inflating them to full blocks', () => {
    for (const thickness of [1, 2]) {
        const voxels: MaterialVoxel[] = [];
        for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let y = 0; y < thickness; y++) voxels.push({position: [x, y, z], material: stone});
        const result = packCopycats(voxels, {resolution: 16, strict: true});
        expect(result.blocks[0].shape.name).toBe(thickness === 1 ? 'copycats:copycat_board' : 'copycats:copycat_layer');
        expect(result.geometryErrorPixels).toBe(0);
        expect(rasterise(result).size).toBe(256 * thickness);
    }
});

test('catalogue boxes stay inside their cell, are disjoint, and use deterministic unique states', () => {
    const states = new Set<string>();
    for (const shape of getCopycatShapes()) {
        const key = shape.name + JSON.stringify(shape.properties);
        expect(states.has(key)).toBe(false); states.add(key);
        const occupancy = new Uint8Array(4096);
        let volume = 0;
        shape.parts.forEach((p) => p.boxes.forEach(([x, y, z, X, Y, Z]) => {
            expect([x, y, z, X, Y, Z].every((n) => Number.isInteger(n) && n >= 0 && n <= 16)).toBe(true);
            expect(X >= x && Y >= y && Z >= z).toBe(true);
            for (let a = x; a < X; a++) {
                for (let b = y; b < Y; b++) {
                    for (let c = z; c < Z; c++) {
                        const i = a + b * 16 + c * 256;
                        if (occupancy[i]) throw new Error(`Overlapping geometry: ${key}`);
                        occupancy[i] = 1; volume++;
                    }
                }
            }
        }));
        expect(volume).toBe(shape.volume);
    }
});

test('empty, invalid and unsupported inputs fail clearly', () => {
    expect(() => packCopycats([], exact)).toThrow('empty');
    expect(() => packCopycats([{position: [NaN, 0, 0], material: stone}], exact)).toThrow('finite integer');
    expect(() => packCopycats([{position: [0, 0, 0], material: 'minecraft:chest'}], exact)).toThrow('Copycat-safe');
    expect(() => packCopycats([{position: [0, 0, 0], material: stone}, {position: [0, 0, 0], material: stone}], exact)).toThrow('Duplicate');
});

test('one palette state can carry different skins at different positions, with inactive slots empty', async () => {
    const result = packCopycats([{position: [0, 0, 0], material: colours[0]}, {position: [2, 0, 0], material: colours[1]}], exact);
    const root: any = simplify((await parse(writeCreateStructure(result))).parsed);
    expect(root.palette).toHaveLength(1);
    expect(root.blocks[0].state).toBe(root.blocks[1].state);
    const slot0 = root.blocks[0].nbt.material_data;
    const slot1 = root.blocks[1].nbt.material_data;
    expect(slot0.bottom_northwest.material.Name).toBe(colours[0]);
    expect(slot1.bottom_northwest.material.Name).toBe(colours[1]);
    expect(slot1.top_southeast.consumedItem).toEqual({});
    expect(slot1.top_southeast.material.Name).toBe('create:copycat_base');
});

test('multistate skins consume each distinct material only once', async () => {
    // Opposite octants require bytes; both use the same material.
    const result = packCopycats([{position: [0, 0, 0], material: stone}, {position: [1, 1, 1], material: stone}], exact);
    const root: any = simplify((await parse(writeCreateStructure(result))).parsed);
    const slots: any[] = Object.values(root.blocks[0].nbt.material_data);
    expect(slots.filter((s) => s.material.Name === stone)).toHaveLength(2);
    expect(slots.filter((s) => s.consumedItem.id === stone)).toHaveLength(1);
});

test('fine mode rejects colour loss even when the occupied geometry can be matched', () => {
    const voxels: MaterialVoxel[] = [];
    for (let x = 0; x < 4; x++) {
        for (let y = 0; y < 4; y++) {
            for (let z = 0; z < 4; z++) {
                voxels.push({position: [x, y, z], material: colours[(x + y + z) % colours.length]});
            }
        }
    }
    expect(() => packCopycats(voxels, {resolution: 4, strict: true})).toThrow('cannot exactly represent');
    const result = packCopycats(voxels, {resolution: 4, strict: false});
    expect(result.geometryErrorPixels).toBe(0);
    expect(result.materialErrorPixels).toBeGreaterThan(0);
});

test('perpendicular adjacent stairs are replaced by independent geometry before export', () => {
    const voxels: MaterialVoxel[] = [];
    // Two 2x cells containing stairs rising in perpendicular directions.
    for (let x = 0; x < 2; x++) {
        for (let y = 0; y < 2; y++) {
            for (let z = 0; z < 2; z++) {
                if (y === 0 || z === 1) voxels.push({position: [x, y, z], material: stone});
                if (y === 0 || x === 1) voxels.push({position: [x, y, z + 2], material: stone});
            }
        }
    }
    const result = packCopycats(voxels, exact);
    expect(result.blocks.every((b) => !b.shape.name.endsWith('_stairs'))).toBe(true);
    expect(result.approximatedBlocks).toBe(0);
    expect(rasterise(result).size).toBe(12 * 512);
});

test('actual assignment pipeline exports a single Create file, and the copycat factory uses exact 2x by default', async () => {
    TEST_PREAMBLE();
    const voxelMesh = new VoxelMesh({voxelOverlapRule: 'first', enableAmbientOcclusion: false});
    voxelMesh.addVoxel(new Vector3(-1, 0, 0), RGBAColours.WHITE);
    voxelMesh.addVoxel(new Vector3(48, 0, 0), RGBAColours.WHITE);
    voxelMesh.calculateNeighbours();
    const blockMesh = BlockMesh.createFromVoxelMesh(voxelMesh, {textureAtlas: 'vanilla', blockPalette: [stone],
        colourSpace: ColourSpace.RGB, fallable: 'do-nothing', dithering: 'off', ditheringMagnitude: 0, resolution: 32,
        calculateLighting: false, lightThreshold: 0, contextualAveraging: false, errorWeight: 0});
    const file = new CreateExporter().export(blockMesh);
    expect(file.type).toBe('single');
    if (file.type !== 'single') throw new Error('Expected one .nbt');
    expect(file.extension).toBe('.nbt');
    const {parsed} = await parse(file.content);
    const root: any = simplify(parsed);
    expect(root.size).toEqual([50, 1, 1]);
    expect(root.blocks).toHaveLength(2);
    const packed = ExporterFactory.GetExporter('create_copycats').export(blockMesh);
    expect(packed.type).toBe('single');
    if (packed.type === 'single') expect((simplify((await parse(packed.content)).parsed) as any).size).toEqual([25, 1, 1]);
    const atlas = Atlas.load('vanilla')!;
    PALETTE_COPYCAT.forEach((name) => expect(atlas.getBlocks().has(name)).toBe(true));
});
