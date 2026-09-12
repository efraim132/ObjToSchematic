import { gunzipSync } from 'zlib';
import { parse, simplify } from 'prismarine-nbt';
import { packCopycats } from '../src/copycats/packer';
import { fitCopycatPreview } from '../src/copycats/preview';
import { getCopycatShapes, isPanelShape } from '../src/copycats/shapes';
import { writeCreateStructure } from '../src/copycats/structure';
import { CopycatShape, MaterialVoxel } from '../src/copycats/types';

function samples(shape: CopycatShape): MaterialVoxel[] {
    const voxels: MaterialVoxel[] = [];
    for (const part of shape.parts) for (const [x,y,z,X,Y,Z] of part.boxes) {
        for (let a = x; a < X; a++) for (let b = y; b < Y; b++) for (let c = z; c < Z; c++) {
            voxels.push({position: [a,b,c], material: 'minecraft:stone'});
        }
    }
    return voxels;
}

test.each(['copycat_slope', 'copycat_slope_layer', 'copycat_vertical_slope'])('%s is opt-in and shared by preview/export', async (name) => {
    const shape = getCopycatShapes().find((s) => s.name === `copycats:${name}` && s.properties.facing === 'south' &&
        (!s.properties.half || s.properties.half === 'bottom') && (!s.properties.layers || s.properties.layers === '5'))!;
    const voxels = samples(shape);
    const options = {resolution: 16 as const, strict: false, includeSlopes: true};
    const result = packCopycats(voxels, options);
    expect(result.blocks[0].shape.name).toBe(shape.name);
    expect(result.geometryErrorPixels).toBe(0);
    expect(result.approximatedBlocks).toBe(1);
    for (const includeSlopes of [false, undefined]) {
        const disabled = packCopycats(voxels, {...options, includeSlopes});
        expect(disabled.blocks.every((b) => !b.shape.approximate)).toBe(true);
        expect(disabled.geometryErrorPixels).toBeGreaterThan(0);
    }
    expect(() => packCopycats(voxels, {...options, strict: true})).toThrow('cannot exactly represent');
    const preview = fitCopycatPreview(voxels.map((v) => ({...v, colour: {r: 0.5, g: 0.5, b: 0.5, a: 1}})), options);
    expect(preview.fit).toEqual(result);
    const nbt = simplify((await parse(gunzipSync(writeCreateStructure(result)))).parsed) as any;
    expect(nbt.palette[0].Name).toBe(shape.name);
});

test('thin panels fit 3/16-block surfaces and can be disabled independently of slopes', () => {
    const panel = getCopycatShapes().find((s) => s.name === 'create:copycat_panel' && s.properties.facing === 'south')!;
    const voxels = samples(panel);
    const options = {resolution: 16 as const, strict: true};
    const enabled = packCopycats(voxels, options);
    expect(enabled.blocks[0].shape.name).toBe('create:copycat_panel');
    expect(enabled.geometryErrorPixels).toBe(0);
    expect(() => packCopycats(voxels, {...options, includePanels: false})).toThrow('cannot exactly represent');
    const disabled = packCopycats(voxels, {...options, strict: false, includePanels: false, includeSlopes: true});
    expect(disabled.blocks.every((b) => !isPanelShape(b.shape))).toBe(true);
    expect(disabled.geometryErrorPixels).toBeGreaterThan(0);
});

test('2x exact fitting remains exact with slopes requested and panels disabled', () => {
    const voxels: MaterialVoxel[] = [{position: [0,0,0], material: 'minecraft:stone'}, {position: [1,1,1], material: 'minecraft:red_concrete'}];
    const result = packCopycats(voxels, {resolution: 2, strict: true, includeSlopes: true, includePanels: false});
    expect(result.approximatedBlocks).toBe(0);
    expect(result.blocks.every((b) => !b.shape.approximate && !isPanelShape(b.shape))).toBe(true);
});
