import { Atlas } from '../src/atlas';
import { packCopycats } from '../src/copycats/packer';
import { createCopycatPreviewBuffers, fitCopycatPreview, PreviewVoxel } from '../src/copycats/preview';

const options = {resolution: 2 as const, strict: true};
const voxels: PreviewVoxel[] = Array.from({length: 8}, (_, i) => ({
    position: [-3 + (i & 1), 2 + ((i >> 1) & 1), -5 + ((i >> 2) & 1)],
    colour: {r: i / 8, g: 0.5, b: 1, a: 1},
}));

test('unassigned preview keeps eight independent colours in a byte block', () => {
    const {fit, colours, origin, textured} = fitCopycatPreview(voxels, options);
    expect(textured).toBe(false);
    expect(fit.blocks).toHaveLength(1);
    expect(fit.blocks[0].shape.name).toBe('copycats:copycat_byte');
    expect(new Set(Object.values(fit.blocks[0].materials)).size).toBe(8);
    const chunks = createCopycatPreviewBuffers(fit, 2, origin, colours, undefined, 3);
    expect(chunks).toHaveLength(3);
    const positions = chunks.flatMap((c) => Array.from(c.buffer.position.data));
    for (let axis = 0; axis < 3; axis++) {
        const coords = positions.filter((_, i) => i % 3 === axis);
        expect(Math.min(...coords)).toBe(origin[axis] - 0.5);
        expect(Math.max(...coords)).toBe(origin[axis] + 1.5);
    }
    const reds = new Set(chunks.flatMap((c) => Array.from(c.buffer.colour.data).filter((_, i) => i % 4 === 0)));
    expect(reds.size).toBe(8);
    for (const chunk of chunks) {
        expect(Math.max(...Array.from(chunk.buffer.indices.data))).toBeLessThan(chunk.buffer.position.data.length / 3);
    }
});

test('assigned preview fits the same shapes and skins as export and supplies cropped atlas UVs', () => {
    const assigned = voxels.slice(0, 3).map((v, i) => ({...v, material: i ? 'minecraft:stone' : 'minecraft:red_concrete'}));
    const {fit, colours, origin, textured} = fitCopycatPreview(assigned, options);
    expect(textured).toBe(true);
    expect(fit).toEqual(packCopycats(assigned.map((v) => ({position: v.position, material: v.material})), options));
    const atlas = Atlas.getVanillaAtlas()!;
    const chunks = createCopycatPreviewBuffers(fit, 2, origin, colours, atlas.getBlocks());
    const uv = Array.from(chunks[0].buffer.texcoord.data);
    expect(uv).toContain(0.5);
    expect(Math.min(...uv)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...uv)).toBeLessThanOrEqual(1);
    const skinUV = atlas.getBlocks().get(fit.blocks[0].materials[fit.blocks[0].shape.parts[0].key])!.faces.west.texcoord;
    expect(chunks[0].buffer.blockTexcoord.data[0]).toBeCloseTo(skinUV.u);
    expect(chunks[0].buffer.blockTexcoord.data[1]).toBeCloseTo(skinUV.v);
});

test('preview faces have outward normals and preserve a partial-block silhouette', () => {
    const {fit, colours, origin} = fitCopycatPreview([voxels[0]], options);
    const {buffer} = createCopycatPreviewBuffers(fit, 2, origin, colours)[0];
    const p = buffer.position.data;
    for (let i = 0; i < buffer.indices.data.length; i += 3) {
        const [a, b, c] = Array.from(buffer.indices.data.slice(i, i + 3));
        const u = [0,1,2].map((axis) => p[b * 3 + axis] - p[a * 3 + axis]);
        const v = [0,1,2].map((axis) => p[c * 3 + axis] - p[a * 3 + axis]);
        const cross = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
        expect(cross.reduce((sum, n, axis) => sum + n * buffer.normal.data[a * 3 + axis], 0)).toBeGreaterThan(0);
    }
    for (let axis = 0; axis < 3; axis++) {
        const coords = Array.from(p).filter((_, i) => i % 3 === axis);
        expect(Math.max(...coords) - Math.min(...coords)).toBe(1);
    }
});

test('preview reports impossible exact fits and keeps export material validation', () => {
    expect(() => fitCopycatPreview([{...voxels[0], material: 'minecraft:torch'}], options)).toThrow('Unsupported copycat material');
    const detailed = [{...voxels[0], position: [0,0,0] as [number,number,number]}, {...voxels[1], position: [3,3,3] as [number,number,number]}];
    expect(() => fitCopycatPreview(detailed, {resolution: 4, strict: true})).toThrow('cannot exactly represent');
    expect(fitCopycatPreview(detailed, {resolution: 4, strict: false}).fit.approximatedBlocks).toBeGreaterThan(0);
    expect(() => packCopycats([{position: [0,0,0], material: '0.5,0.5,1,1'}], options)).toThrow('Unsupported copycat material');
});
